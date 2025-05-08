export class JobAutoApply {
    constructor() {
        console.log('[JobAutoApply] Class instantiated');
        this.platform = this.detectPlatform();
        this.userDataCache = {};
        this.isAutoRunning = false;
        this.autoRunnerInterval = null;
        
        // Load initial state
        chrome.storage.local.get(['isAutoRunning', 'userData'], (result) => {
            console.log('[JobAutoApply] Initial state:', result);
            this.userDataCache = result.userData || {};
            this.isAutoRunning = result.isAutoRunning || false;
            if (this.isAutoRunning) {
                console.log('[JobAutoApply] Auto-running enabled on load');
                this.startAutoRunner();
            }
        });

        this.init();
    }

    // ... rest of the class implementation ...
    // Copy all methods from above but without the outer class wrapper
}
