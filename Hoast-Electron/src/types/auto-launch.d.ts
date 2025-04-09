declare module 'auto-launch' {
  interface AutoLaunchOptions {
    /** The name of the app */
    name: string;
    /** The absolute path to the app */
    path: string;
    /** Whether to hide the app on launch */
    isHidden?: boolean;
  }

  class AutoLaunch {
    constructor(options: AutoLaunchOptions);
    
    /**
     * Enables auto-launch on system startup
     */
    enable(): Promise<void>;
    
    /**
     * Disables auto-launch on system startup
     */
    disable(): Promise<void>;
    
    /**
     * Checks if auto-launch is enabled
     */
    isEnabled(): Promise<boolean>;
  }

  export default AutoLaunch;
}