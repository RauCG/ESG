import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { Channel, invoke } from '@tauri-apps/api/core';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { PtsEvent } from '../types';

@Component({
  selector: 'app-terminal-view',
  standalone: true,
  template: `
    <div class="flex h-full flex-col">
      @if (closed()) {
        <div class="flex h-full items-center justify-center gap-2 text-sm text-muted">
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
          Terminal finalizada
        </div>
      } @else {
        <div #termContainer class="term-host min-h-0 flex-1 overflow-hidden bg-[#0b0f1a] px-2 py-1"></div>
      }
    </div>
  `,
})
export class TerminalView implements AfterViewInit, OnDestroy {
  @ViewChild('termContainer') container!: ElementRef<HTMLDivElement>;
  @Input() sessionId!: number;

  closed = signal(false);
  private term?: Terminal;
  private fit?: FitAddon;
  private onResize = () => this.fitNow();

  ngAfterViewInit() {
    this.openTerminal();
  }

  private async openTerminal() {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      theme: { background: '#0b0f1a', foreground: '#d5dae5' },
      allowTransparency: true,
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(this.container.nativeElement);
    this.term = term;
    this.fit = fit;

    await this.fitNow();

    const channel = new Channel<PtsEvent>();
    channel.onmessage = (ev: PtsEvent) => {
      if (ev.type === 'data') {
        term.write(new Uint8Array(ev.data));
      } else if (ev.type === 'exit') {
        this.closed.set(true);
        term.write(`\r\n\u001b[90m[proceso finalizado\u001b[0m\r\n`);
      }
    };
    await invoke('pty_attach', { id: this.sessionId, onEvent: channel }).catch((e) => {
      this.closed.set(true);
      term.write(`\r\n[error al conectar: ${e}]\r\n`);
    });

    term.onData((data) => {
      if (this.closed()) return;
      invoke('pty_write', { id: this.sessionId, data: Array.from(new TextEncoder().encode(data)) }).catch(
        () => {},
      );
    });
    term.onResize(({ cols, rows }) => {
      invoke('pty_resize', { id: this.sessionId, cols, rows }).catch(() => {});
    });

    window.addEventListener('resize', this.onResize);
    term.focus();
  }

  private async fitNow() {
    if (!this.term || !this.fit) return;
    try {
      this.fit.fit();
      const cols = this.term.cols;
      const rows = this.term.rows;
      await invoke('pty_resize', { id: this.sessionId, cols, rows }).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.onResize);
    this.term?.dispose();
    this.term = undefined;
  }
}