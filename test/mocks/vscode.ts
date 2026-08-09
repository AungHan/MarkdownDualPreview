/**
 * Hand-rolled stub of the subset of the `vscode` API used by the extension
 * host code under unit test. Intentionally tiny; extend as new APIs are used.
 *
 * Tests drive behaviour through the `__test` harness (inspect created panels,
 * fire events, reset state between cases).
 */

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2
}

export enum ColorThemeKind {
  Light = 1,
  Dark = 2,
  HighContrast = 3,
  HighContrastLight = 4
}

export enum TextEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutsideViewport = 2,
  AtTop = 3
}

export class EventEmitter<T> {
  private readonly listeners = new Set<(e: T) => void>();
  readonly event = (listener: (e: T) => void): Disposable => {
    this.listeners.add(listener);
    return new Disposable(() => this.listeners.delete(listener));
  };
  fire(data: T): void {
    // Mirror VS Code: a listener removed earlier in this same delivery is
    // skipped (it is not invoked once unsubscribed mid-fire).
    for (const listener of [...this.listeners]) {
      if (this.listeners.has(listener)) {
        listener(data);
      }
    }
  }
  dispose(): void {
    this.listeners.clear();
  }
}

export class Disposable {
  constructor(private readonly callback: () => void) {}
  dispose(): void {
    this.callback();
  }
}

export class Position {
  constructor(readonly line: number, readonly character: number) {}
}

export class Range {
  constructor(
    readonly startLine: number,
    readonly startChar: number,
    readonly endLine: number,
    readonly endChar: number
  ) {}
}

export class Uri {
  private constructor(readonly scheme: string, readonly path: string) {}
  static file(p: string): Uri {
    const normalized = p.replace(/\\/g, '/');
    return new Uri('file', normalized.startsWith('/') ? normalized : `/${normalized}`);
  }
  static parse(value: string): Uri {
    const idx = value.indexOf(':');
    const scheme = idx > 0 ? value.slice(0, idx) : 'file';
    const rest = value.slice(idx + 1).replace(/^\/+/, '/');
    return new Uri(scheme, rest);
  }
  static joinPath(base: Uri, ...segments: string[]): Uri {
    const joined = [base.path.replace(/\/$/, ''), ...segments].join('/');
    return new Uri(base.scheme, joined);
  }
  get fsPath(): string {
    return this.path.replace(/\//g, '\\');
  }
  toString(): string {
    return `${this.scheme}://${this.path}`;
  }
}

export interface FakeWebview {
  html: string;
  cspSource: string;
  postMessage(message: unknown): Thenable<boolean>;
  onDidReceiveMessage(listener: (e: unknown) => void): Disposable;
  asWebviewUri(uri: Uri): Uri;
  readonly options: unknown;
  readonly posted: unknown[];
  __fireMessage(message: unknown): void;
}

export interface FakeWebviewPanel {
  readonly viewType: string;
  title: string;
  readonly webview: FakeWebview;
  reveal(column?: ViewColumn): void;
  dispose(): void;
  onDidDispose(listener: () => void): Disposable;
  readonly revealCalls: number;
  disposed: boolean;
  /** The `options` argument passed to `createWebviewPanel`, for assertions. */
  readonly createOptions: unknown;
}

function createWebview(): FakeWebview {
  const messageEmitter = new EventEmitter<unknown>();
  const posted: unknown[] = [];
  return {
    html: '',
    cspSource: 'vscode-webview://mock',
    options: {},
    posted,
    postMessage(message: unknown): Thenable<boolean> {
      posted.push(message);
      return Promise.resolve(true);
    },
    onDidReceiveMessage(listener: (e: unknown) => void): Disposable {
      return messageEmitter.event(listener);
    },
    asWebviewUri(uri: Uri): Uri {
      return Uri.parse(`https://file+.vscode-resource.vscode-cdn.net${uri.path}`);
    },
    __fireMessage(message: unknown): void {
      messageEmitter.fire(message);
    }
  };
}

const createdPanels: FakeWebviewPanel[] = [];

export const window = {
  warningMessages: [] as string[],
  errorMessages: [] as string[],
  visibleTextEditors: [] as unknown[],
  activeColorTheme: { kind: ColorThemeKind.Dark },
  onDidChangeTextEditorVisibleRangesEmitter: new EventEmitter<unknown>(),
  onDidChangeActiveColorThemeEmitter: new EventEmitter<{ kind: ColorThemeKind }>(),

  createWebviewPanel(
    viewType: string,
    title: string,
    _showOptions: unknown,
    options?: unknown
  ): FakeWebviewPanel {
    const disposeEmitter = new EventEmitter<void>();
    let revealCalls = 0;
    const panel: FakeWebviewPanel = {
      viewType,
      title,
      webview: createWebview(),
      disposed: false,
      createOptions: options,
      get revealCalls() {
        return revealCalls;
      },
      reveal(): void {
        revealCalls++;
      },
      dispose(): void {
        if (!panel.disposed) {
          panel.disposed = true;
          disposeEmitter.fire();
        }
      },
      onDidDispose(listener: () => void): Disposable {
        return disposeEmitter.event(listener);
      }
    };
    createdPanels.push(panel);
    return panel;
  },

  showWarningMessage(message: string): Thenable<undefined> {
    window.warningMessages.push(message);
    return Promise.resolve(undefined);
  },
  showErrorMessage(message: string): Thenable<undefined> {
    window.errorMessages.push(message);
    return Promise.resolve(undefined);
  },
  onDidChangeTextEditorVisibleRanges(listener: (e: unknown) => void): Disposable {
    return window.onDidChangeTextEditorVisibleRangesEmitter.event(listener);
  },
  onDidChangeActiveColorTheme(listener: (e: { kind: ColorThemeKind }) => void): Disposable {
    return window.onDidChangeActiveColorThemeEmitter.event(listener);
  }
};

export const workspace = {
  textDocuments: [] as unknown[],
  workspaceFolders: undefined as { readonly uri: Uri }[] | undefined,
  configValues: new Map<string, unknown>(),
  onDidChangeTextDocumentEmitter: new EventEmitter<unknown>(),
  onDidCloseTextDocumentEmitter: new EventEmitter<unknown>(),
  onDidRenameFilesEmitter: new EventEmitter<unknown>(),
  onDidChangeConfigurationEmitter: new EventEmitter<unknown>(),
  getConfiguration(section?: string) {
    const prefix = section ? `${section}.` : '';
    return {
      get<T>(key: string, defaultValue: T): T {
        const value = workspace.configValues.get(`${prefix}${key}`);
        return value === undefined ? defaultValue : (value as T);
      }
    };
  },
  onDidChangeTextDocument(listener: (e: unknown) => void): Disposable {
    return workspace.onDidChangeTextDocumentEmitter.event(listener);
  },
  onDidCloseTextDocument(listener: (e: unknown) => void): Disposable {
    return workspace.onDidCloseTextDocumentEmitter.event(listener);
  },
  onDidRenameFiles(listener: (e: unknown) => void): Disposable {
    return workspace.onDidRenameFilesEmitter.event(listener);
  },
  onDidChangeConfiguration(listener: (e: unknown) => void): Disposable {
    return workspace.onDidChangeConfigurationEmitter.event(listener);
  }
};

export const env = {
  clipboard: {
    written: [] as string[],
    writeText(text: string): Thenable<void> {
      env.clipboard.written.push(text);
      return Promise.resolve();
    }
  }
};

export const commands = {
  registered: new Map<string, (...args: unknown[]) => unknown>(),
  registerCommand(id: string, callback: (...args: unknown[]) => unknown): Disposable {
    commands.registered.set(id, callback);
    return new Disposable(() => commands.registered.delete(id));
  }
};

/** Test-only harness to inspect and reset the mock between cases. */
export const __test = {
  createdPanels,
  reset(): void {
    createdPanels.length = 0;
    window.warningMessages.length = 0;
    window.errorMessages.length = 0;
    window.visibleTextEditors.length = 0;
    window.activeColorTheme = { kind: ColorThemeKind.Dark };
    workspace.textDocuments.length = 0;
    workspace.workspaceFolders = undefined;
    workspace.configValues.clear();
    env.clipboard.written.length = 0;
    commands.registered.clear();
  }
};
