// Modal interaction related functions
export class ModalHandler {
    constructor() {
        this.successIndicators = [
            'Application sent',
            'Your application was sent to',
            'application was submitted',
            'successfully submitted',
            'You can keep track of your application',
            'can keep track of your application',
            'track your application in',
            'Applied',
            'My Jobs'
        ];

        this.doneSelectors = [
            'button.artdeco-modal__dismiss',
            'button.artdeco-button--primary',
            'button[data-control-name="dismiss_application_modal"]',
            'button[aria-label="Dismiss"]',
            'button[aria-label="Done"]'
        ];
    }

    getModalState(modal) {
        const modalContent = {
            text: modal.textContent,
            successSection: null,
            hasSuccessMessage: false,
            isDoneState: false,
            isResumeStep: false,
            visibleButtons: this.getVisibleButtons(modal)
        };

        modalContent.successSection = this.findSuccessSection(modal);
        modalContent.hasSuccessMessage = this.hasSuccessMessage(modalContent.text, modalContent.successSection);
        modalContent.isDoneState = this.isDoneState(modalContent);
        modalContent.isResumeStep = modal.querySelector('.jobs-resume-picker') !== null;

        return modalContent;
    }

    getVisibleButtons(modal) {
        return Array.from(modal.querySelectorAll('button:not([disabled])')).map(btn => ({
            text: btn.textContent.trim().toLowerCase(),
            ariaLabel: btn.getAttribute('aria-label')?.toLowerCase() || '',
            classes: Array.from(btn.classList),
            isFooterButton: btn.closest('footer') !== null
        }));
    }

    findSuccessSection(modal) {
        return Array.from(modal.querySelectorAll('section, div')).find(section => 
            section.textContent.includes('Application sent') ||
            section.textContent.includes('Your application was sent to') ||
            section.textContent.includes('You can keep track of your application')
        );
    }

    hasSuccessMessage(modalText, successSection) {
        return this.successIndicators.some(indicator => 
            modalText.includes(indicator)
        ) || (
            modalText.includes('Applied') && 
            modalText.includes('My Jobs')
        ) || !!successSection;
    }

    isDoneState(modalContent) {
        return modalContent.hasSuccessMessage && 
            modalContent.visibleButtons.some(btn => 
                btn.text === 'done' || 
                btn.text === 'dismiss' || 
                btn.ariaLabel.includes('done') || 
                btn.ariaLabel.includes('dismiss')
            );
    }

    async findDoneButton(modal) {
        await new Promise(res => setTimeout(res, 1000));

        // Check success section first
        const successSection = this.findSuccessSection(modal);
        if (successSection) {
            const doneButton = Array.from(successSection.querySelectorAll('button')).find(btn => 
                btn.textContent.trim().toLowerCase() === 'done'
            );
            if (doneButton) return doneButton;
        }

        // Try all selectors
        for (const selector of this.doneSelectors) {
            const buttons = Array.from(modal.querySelectorAll(selector));
            const doneButton = buttons.find(btn => 
                btn.textContent.trim().toLowerCase() === 'done' ||
                btn.getAttribute('aria-label')?.toLowerCase().includes('done')
            );
            if (doneButton) return doneButton;
        }

        // Try any button with Done text
        const doneButton = Array.from(modal.querySelectorAll('button')).find(btn => 
            btn.textContent.trim().toLowerCase() === 'done'
        );

        return doneButton;
    }

    async closeModalWithEscape(modal) {
        if (!document.contains(modal) || !modal.offsetParent) return true;

        console.log('[JobAutoApply] Trying Escape key to close modal');
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true
        }));

        await new Promise(res => setTimeout(res, 1000));
        return !document.contains(modal) || !modal.offsetParent;
    }

    findActionButton(modalContent, submissionAttempted) {
        return modalContent.visibleButtons.find(btn => {
            if (btn.text === 'done' || btn.text === 'dismiss') return false;
            
            const isSubmitButton = btn.text.includes('submit') || 
                                 btn.ariaLabel.includes('submit application');
            
            if (isSubmitButton) return true;
            
            return btn.text.includes('next') || 
                   btn.text.includes('review') || 
                   btn.text.includes('continue') ||
                   btn.ariaLabel.includes('next') || 
                   btn.ariaLabel.includes('review') || 
                   btn.ariaLabel.includes('continue') ||
                   (btn.isFooterButton && btn.classes.includes('artdeco-button--primary'));
        });
    }

    async getJobDetails(modalContent) {
        let companyName = 'Unknown Company';
        const successMatch = modalContent.text.match(/(?:sent to|submitted to|sent successfully to) ([^!\.]+)(?:!|\.)/);
        if (successMatch) {
            companyName = successMatch[1].trim();
        }
        
        return {
            title: document.querySelector('.jobs-unified-top-card__job-title')?.textContent.trim(),
            company: companyName,
            location: document.querySelector('.jobs-unified-top-card__bullet')?.textContent.trim(),
            date: new Date().toISOString()
        };
    }
}
