import type { InstallResult, UninstallResult } from '../types.js';
export declare class DshCliClient {
    private dshCommand;
    private useNpx;
    constructor(dshCommand?: string);
    autoDetect(): Promise<boolean>;
    private checkCommand;
    private resolveExec;
    private exec;
    install(pluginSpec: string, profile?: string): Promise<InstallResult>;
    uninstall(pluginId: string, profile?: string): Promise<UninstallResult>;
    list(profile?: string): Promise<string[]>;
    isAvailable(): Promise<boolean>;
    getVersion(): Promise<string | null>;
}
//# sourceMappingURL=dsh-cli.d.ts.map