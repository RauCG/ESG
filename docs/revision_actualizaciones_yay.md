# Revisión de actualizaciones con Yay

Documento de trabajo para **revisar manualmente** el flujo de actualizaciones del
gestor AUR **yay** dentro de ESG.

- Fecha: 2026-09-12
- Estado: pendiente de revisión en GUI

---

## 1. Contexto

- Sistema de referencia: **Arch Linux** con **pacman + yay** (no hay paru, flatpak ni snap).
- En este sistema, yay es el único helper AUR instalado.
- Decisión de diseño tomada previamente: **no cambiar** la lógica de preferencia
  yay/paru de `apply_family_defaults` (si existieran ambos, se prefiere paru y yay queda
  desactivado por defecto).

## 2. Cómo funciona hoy en ESG

### 2.1 Detección de actualizaciones (`list_updates`)

- `list_updates("yay")` → `arch_updates(app, true)` → ejecuta `yay -Qu`
  (`packages.rs:369-430`).
- `yay -Qu` refresca sus sync databases con fakeroot y consulta repos + AUR, por lo que
  **no requiere sudo** en ESG.
- El parseo admite dos formatos:
  - Repo:     `core/bash 5.3.0-1 -> 5.3.15-1`
  - AUR puro: `aur/somepkg 1.0-1 -> 1.1-1` (captura el prefijo `repo/` en `UpdateInfo.repo`).
- Si el gestor es `pacman` a secas, usa `checkupdates` o `sudo -n pacman -Sy` + `pacman -Qu`.
- El resultado se cataloga como categoría **`aur`** y manager **yay** cuando la familia es
  arch (`packages.rs:380-393`).

### 2.2 Scripts de operación (proyecto de `ops.rs:21-29`)

| Operación | Gestor yay | Observaciones |
| --------- | ---------- | ------------- |
| update    | `yay -Syu --noconfirm --cleanafter` | Actualiza repos + AUR en una pasada; `--cleanafter` limpia sobrantes de build. |
| upgrade   | `yay -S --noconfirm --needed <pkg>` | Una o varios paquetes por gestor (compatible con "Actualizar pendientes"). |
| install   | `yay -S --noconfirm --needed <pkg>` | Mismo binario que `upgrade`. |
| uninstall | `sudo pacman -Rns --noconfirm <pkg>` | Desinstala con pacman (no el helper). |
| cache     | `yay -Sc --noconfirm` | Limpieza de caché del helper. |

- **Sudo**: yay NO está en `ROOT_BY_KIND` (`ops.service.ts:27-34`). `yay` pedirá
  `[sudo] password for` internamente cuando ejecute la parte pacman; ESG detecta ese
  prompt en la salida del PTY y envía la contraseña inline (flujo `SudoService`).

### 2.3 Frontend

- `PackagesService.refresh()` consulta `list_updates` por cada gestor activo y mezcla el
  resultado (señal `updates`); `updatesFor(manager)` permite consultar uno solo.
- Entradas para disparar actualizaciones:
  - Dashboard → botón **Actualizar todo** (`updateAll`, `dashboard.ts:196`).
  - Programas → **Actualizar pendientes (yay)** que agrupa por manager
    (`programs.ts:225-231`) y **Actualizar** individual por fila con update pendiente.
  - Detalle de paquete → botón **Actualizar** (`package.ts:301`).
- Todas pasan por `OpsService.run` que abre el panel de Operaciones y lo auto-expande.

## 3. Checklist de revisión manual (GUI)

> Arrancar con: `GDK_BACKEND=x11 WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri dev`

1. **Preparación**: garantizar que haya actualizaciones (p. ej. que `yay -Qu` en terminal
   devuelva al menos un paquete de repo y, si es posible, uno AUR).
2. **Dashboard**: con `yay` activado en Ajustes, el resumen debe mostrar el nº de
   actualizaciones y el desglose, sin pedir contraseña aún (solo lectura con `-Qu`).
3. **Actualizar todo**: pulsar el botón → debe expandirse el panel de Operaciones,
   pedir la contraseña sudo (si el timestamp caducó), emitir `» Actualizar (yay)` y
   completar `yay -Syu --noconfirm --cleanafter`. Verificar que finaliza con
   `Proceso finalizado (0)`.
4. **Actualización individual** (Programas): en un paquete con update pendiente, acción
   **Actualizar** → se ejecuta `yay -S --noconfirm --needed <pkg>`.
5. **Detalle de paquete**: abrir un paquete con update pendiente desde la tienda o
   programas → botón **Actualizar** → mismo flujo anterior.
6. **Actualización AUR pura**: con un paquete AUR instalado y desactualizado (p. ej. un
   paquete `-git` o uno marcado como AUR en la lista), comprobar que aparece en las
   actualizaciones con el prefijo `aur/`.
7. **Cancelación**: iniciar una actualización y cancelarla desde el panel; el estado del
   op debe pasar a `cancelado/error` sin colgar la sesión PTY.
8. **Sin sudo válido**: rellenar mal la contraseña → mensaje de error de sudo y
   operación fallida con `Proceso finalizado (distinto de 0)`.

## 4. Riesgos y notas

- **`--noconfirm`**: no hay confirmación interactiva; revisar siempre la pantalla de
  cambios de `-Syu` antes de que arranquen los builds AUR.
- **Pares yay/paru**: si un día se instala paru, yay quedará desactivado por defecto
  (paru gana). Para probar yay habría que re-activarlo en Ajustes. Decisión: no tocar.
- **Red / dbs**: si `yay -Qu` no puede refrescar los mirrors o el RPC de AUR falla, la
  lista podrá salir vacía o el comando fallar; conviene comprobarlo en esta revisión.
- **Paquetes devel**: `yay -Qu` (sin `--devel`) NO incluye updates de paquetes `-git`
  por defecto; eso es esperado.
- **`upgrade` a varios**: "Actualizar pendientes (yay)" agrupa los nombres en un solo
  `yay -S --needed pkg1 pkg2 ...`; verificar que con un nombre que ya no exista el
  comando falla de forma informativa.

## 5. Comandos de referencia (fuera de ESG)

```bash
yay -Qu                                   # qué hay para actualizar (repos + AUR)
yay -Syu --noconfirm --cleanafter         # actualización completa (para comparar)
yay -S --noconfirm --needed firefox       # actualización/instalación individual
sudo pacman -Rns <pkg>                    # desinstalación (equivalente de ESG)
```

## 6. Resultado de la revisión

_(Rellenar al completar el checklist)_
- [ ] Pasos 2 a 8 correctos
- [ ] Salida de `yay -Syu` limpia en el panel de Operaciones
- [ ] Prompt de sudo manejado inline sin errores
- [ ] Incidencias observadas: