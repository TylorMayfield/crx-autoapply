import { FormHandler } from './modules/formHandler';
import { ModalHandler } from './modules/modalHandler';
import { StorageHandler } from './modules/storageHandler';

class JobAutoApply {
    constructor() {
        if (window.jobAutoApplyInitialized) return;
        window.jobAutoApplyInitialized = true;

        console.log('[JobAutoApply] Initializing...');

        this.platform = this.detectPlatform();
        this.userDataCache = {};
        this.isAutoRunning = false;
        this.autoRunnerInterval = null;
        this.isProcessingJob = false;

        // Initialize handlers
        this.formHandler = null; // Will be initialized after userData is loaded
        this.modalHandler = new ModalHandler();
        this.storageHandler = new StorageHandler();

        // Check if we're on a LinkedIn jobs page
        const isJobsPage = window.location.pathname.includes('/jobs/') || 
                          window.location.pathname.includes('/job/');

        this.init().then(() => {
            console.log('[JobAutoApply] Initialization complete');
            // Auto-start if we're on a LinkedIn jobs page
            if (this.platform === 'linkedin' && isJobsPage) {
                console.log('[JobAutoApply] Auto-starting on jobs page');
                this.startAutoRunner();
            }
        }).catch(err => {
            console.error('[JobAutoApply] Initialization error:', err);
        });

        window.autoApply = this; // Expose globally for debugging
    }

    async init() {
        const result = await chrome.storage.local.get(['isAutoRunning', 'userData']);
        this.userDataCache = result.userData || {};
        this.isAutoRunning = result.isAutoRunning || false;
        
        // Initialize form handler with user data
        this.formHandler = new FormHandler(this.userDataCache);

        this.setupMessageListener();

        if (this.isAutoRunning && this.platform === 'linkedin') {
            this.startAutoRunner();
        }
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'TOGGLE_AUTO_RUNNER') {
                if (this.platform !== 'linkedin') {
                    sendResponse({ success: false, error: 'Navigate to LinkedIn jobs page' });
                    return true;
                }

                if (message.enabled) {
                    this.startAutoRunner();
                } else {
                    this.stopAutoRunner();
                }
                
                // Save the state to storage
                chrome.storage.local.set({ isAutoRunning: message.enabled });
                sendResponse({ success: true });
            }
            return true;
        });
    }

    detectPlatform() {
        if (window.location.hostname.includes('linkedin.com')) return 'linkedin';
        if (window.location.hostname.includes('indeed.com')) return 'indeed';
        return null;
    }

    startAutoRunner() {
        if (this.platform !== 'linkedin') return;

        this.isAutoRunning = true;
        this.isProcessingJob = false;
        this.runAutoApply();

        // Use a longer interval to prevent overlap
        this.autoRunnerInterval = setInterval(() => this.runAutoApply(), 10000);
    }

    stopAutoRunner() {
        this.isAutoRunning = false;
        this.isProcessingJob = false;
        if (this.autoRunnerInterval) {
            clearInterval(this.autoRunnerInterval);
            this.autoRunnerInterval = null;
        }
    }

    async runAutoApply() {
        if (!this.isAutoRunning || this.platform !== 'linkedin') return;

        // Use a lock to ensure only one job is processed at a time
        if (this.isProcessingJob) {
            console.log('[JobAutoApply] Already processing a job, skipping this run');
            return;
        }

        try {
            this.isProcessingJob = true; // Set flag before starting

            // Try to find an Easy Apply job in the current list
            const jobFound = await this.findAndProcessNextJob();

            if (!jobFound) {
                // If no jobs found in current page, try to go to next page
                const nextPageClicked = await this.goToNextPage();
                if (!nextPageClicked) {
                    console.log('[JobAutoApply] No more pages to process');
                }
                // Wait for new page to load
                await new Promise(res => setTimeout(res, 2000));
            }
        } catch (error) {
            console.error('[JobAutoApply] Error during auto-apply:', error);
        } finally {
            this.isProcessingJob = false; // Always clear flag when done
        }
    }

    async findAndProcessNextJob() {
        // Get all unprocessed job cards in the list
        const jobCards = Array.from(document.querySelectorAll('.job-card-container, .jobs-search-results__list-item')).filter(
            card => !card.hasAttribute('data-auto-apply-processed')
        );

        console.log('[JobAutoApply] Found', jobCards.length, 'unprocessed job cards');

        for (const jobCard of jobCards) {
            if (!this.isAutoRunning) return false;

            // Mark this card as processed
            jobCard.setAttribute('data-auto-apply-processed', 'true');

            // Click the job card to show its details
            const jobLink = jobCard.querySelector('.job-card-container__link, .job-card-list__title');
            if (jobLink) {
                jobCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise(res => setTimeout(res, 1000));
                jobLink.click();
                await new Promise(res => setTimeout(res, 2000));
            }

            // Look for Easy Apply button
            const easyApplyButton = document.querySelector('.jobs-apply-button:not([data-auto-apply-processed])');
            if (easyApplyButton && easyApplyButton.textContent.toLowerCase().includes('easy apply')) {
                console.log('[JobAutoApply] Found Easy Apply button');
                easyApplyButton.setAttribute('data-auto-apply-processed', 'true');
                easyApplyButton.click();
                await new Promise(res => setTimeout(res, 2000));

                const applied = await this.handleEasyApplyForm();
                await new Promise(res => setTimeout(res, applied ? 3000 : 1000));
                return true;
            }

            console.log('[JobAutoApply] No Easy Apply button found, moving to next job');
        }

        return false;
    }

    async goToNextPage() {
        // Find the current page number
        const activePageButton = document.querySelector('button[aria-current="true"]');
        if (!activePageButton) return false;

        // Find the next page button
        const nextPageButton = Array.from(document.querySelectorAll('button[aria-label*="Page"]')).find(btn => {
            const btnNumber = parseInt(btn.textContent);
            const currentNumber = parseInt(activePageButton.textContent);
            return btnNumber === currentNumber + 1;
        });

        if (nextPageButton) {
            console.log('[JobAutoApply] Going to next page:', nextPageButton.textContent);
            nextPageButton.click();
            return true;
        }

        return false;
    }

    async handleEasyApplyForm() {
        const modal = document.querySelector('.jobs-easy-apply-modal');
        if (!modal) return false;

        let submissionAttempted = false;

        while (this.isAutoRunning) {
            await new Promise(res => setTimeout(res, 2000));

            // First, always check for a Done button and try to click it
            const doneButton = Array.from(modal.querySelectorAll('button')).find(btn => {
                const buttonText = btn.textContent.trim().toLowerCase();
                const spanElement = btn.querySelector('span.artdeco-button__text');
                const spanText = spanElement?.textContent.trim().toLowerCase() || '';
                const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                
                return buttonText === 'done' || 
                       spanText === 'done' ||
                       ariaLabel.includes('done') ||
                       ariaLabel.includes('dismiss') ||
                       btn.closest('button[aria-label*="done" i]') !== null;
            });

            if (doneButton) {
                console.log('[JobAutoApply] Found Done button, attempting to click');
                doneButton.click();
                await new Promise(res => setTimeout(res, 1000));
                
                // Check if modal is gone
                if (!document.contains(modal) || !modal.offsetParent) {
                    console.log('[JobAutoApply] Successfully closed modal with Done button');
                    return true;
                }
            }

            // Check if we're on a resume step first
            const isResumeStep = modal.querySelector('.jobs-resume-picker') !== null;
            if (isResumeStep) {
                console.log('[JobAutoApply] Resume step detected, proceeding with next button');
                // Immediately look for next/review button without handling other fields
                const nextButton = Array.from(modal.querySelectorAll('button')).find(btn => {
                    const text = btn.textContent.trim().toLowerCase();
                    const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
                    return text.includes('next') || 
                           text.includes('review') || 
                           ariaLabel.includes('next') || 
                           ariaLabel.includes('review');
                });
                
                if (nextButton) {
                    console.log('[JobAutoApply] Clicking next/review on resume step');
                    nextButton.click();
                    await new Promise(res => setTimeout(res, 2000));
                    continue;
                }
            }

            // Handle non-resume empty fields
            const emptyFields = this.formHandler.findEmptyFormFields(modal);
            if (emptyFields.length > 0) {
                // Filter out resume-related fields
                const nonResumeFields = emptyFields.filter(f => 
                    !f.fieldName.toLowerCase().includes('resume') && 
                    !f.fieldName.toLowerCase().includes('cv')
                );

                if (nonResumeFields.length > 0) {
                    console.log('[JobAutoApply] Found non-resume empty fields:', nonResumeFields.map(f => f.fieldName));
                    
                    // Try to handle non-resume empty fields
                    await this.formHandler.handleEmptyFields(nonResumeFields);
                    
                    // Add extra wait time after filling fields
                    await new Promise(res => setTimeout(res, 2000));
                    
                    // Verify if we still have empty fields that aren't resume-related
                    const remainingFields = this.formHandler.findEmptyFormFields(modal);
                    const remainingNonResumeFields = remainingFields.filter(f => 
                        !f.fieldName.toLowerCase().includes('resume') && 
                        !f.fieldName.toLowerCase().includes('cv')
                    );

                    if (remainingNonResumeFields.length > 0) {
                        console.log('[JobAutoApply] Still have non-resume empty fields, need user input:', 
                            remainingNonResumeFields.map(f => f.fieldName));
                        // Skip rest of loop to allow for user input
                        continue;
                    }
                }
            }

            // Now proceed with modal state analysis
            // Analyze current modal content and log it for debugging
            const modalContent = {
                text: modal.textContent,
                successSection: null,
                hasSuccessMessage: false,
                isDoneState: false,
                isResumeStep: false,
                visibleButtons: Array.from(modal.querySelectorAll('button:not([disabled])')).map(btn => ({
                    text: btn.textContent.trim().toLowerCase(),
                    ariaLabel: btn.getAttribute('aria-label')?.toLowerCase() || '',
                    classes: Array.from(btn.classList),
                    isFooterButton: btn.closest('footer') !== null
                }))
            };

            // First check for a success section which might contain our target messages
            modalContent.successSection = Array.from(modal.querySelectorAll('section, div')).find(section => 
                section.textContent.includes('Application sent') ||
                section.textContent.includes('Your application was sent to') ||
                section.textContent.includes('You can keep track of your application')
            );

            // Improved success message detection
            const successIndicators = [
                'Application sent',
                'Your application was sent to',
                'application was submitted',
                'successfully submitted',
                'You can keep track of your application',
                'can keep track of your application',
                'track your application in',
                'Applied',  // When combined with "My Jobs"
                'My Jobs'   // When combined with "Applied"
            ];

            // Log the full modal text for debugging
            console.log('[JobAutoApply] Current modal text:', modal.textContent);

            // Check for success using multiple indicators
            modalContent.hasSuccessMessage = successIndicators.some(indicator => 
                modalContent.text.includes(indicator)
            ) || (
                modalContent.text.includes('Applied') && 
                modalContent.text.includes('My Jobs')
            );

            // Extra check for success section
            if (modalContent.successSection) {
                console.log('[JobAutoApply] Success section found:', modalContent.successSection.textContent);
                modalContent.hasSuccessMessage = true;
            }

            // Check if we're in a done state (success message + done/dismiss button)
            modalContent.isDoneState = modalContent.hasSuccessMessage && 
                modalContent.visibleButtons.some(btn => 
                    btn.text === 'done' || 
                    btn.text === 'dismiss' || 
                    btn.ariaLabel.includes('done') || 
                    btn.ariaLabel.includes('dismiss')
                );

            // Check if we're on a resume step
            modalContent.isResumeStep = modal.querySelector('.jobs-resume-picker') !== null;

            console.log('[JobAutoApply] Modal state:', {
                hasSuccessMessage: modalContent.hasSuccessMessage,
                isDoneState: modalContent.isDoneState,
                isResumeStep: modalContent.isResumeStep,
                visibleButtons: modalContent.visibleButtons.map(b => b.text)
            });

            // If we have a success message, track it and continue
            if (modalContent.hasSuccessMessage) {
                try {
                    let companyName = 'Unknown Company';
                    const successMatch = modalContent.text.match(/(?:sent to|submitted to|sent successfully to) ([^!\.]+)(?:!|\.)/);
                    if (successMatch) {
                        companyName = successMatch[1].trim();
                    }
                    
                    const jobDetails = {
                        title: document.querySelector('.jobs-unified-top-card__job-title')?.textContent.trim(),
                        company: companyName,
                        location: document.querySelector('.jobs-unified-top-card__bullet')?.textContent.trim(),
                        date: new Date().toISOString()
                    };
                    
                    await this.trackSuccessfulApplication(jobDetails);
                    console.log('[JobAutoApply] Successfully applied to:', companyName);
                    return true;
                } catch (error) {
                    console.error('[JobAutoApply] Error processing successful application:', error);
                }
            }

            // Handle resume step
            if (modalContent.isResumeStep) {
                console.log('[JobAutoApply] Resume step detected');
                const nextButton = modalContent.visibleButtons.find(btn => 
                    btn.text.includes('next') || 
                    btn.text.includes('review') || 
                    btn.ariaLabel.includes('next') || 
                    btn.ariaLabel.includes('review')
                );
                if (nextButton) {
                    const button = modal.querySelector(`button[aria-label="${nextButton.ariaLabel}"]`) || 
                                 Array.from(modal.querySelectorAll('button')).find(b => 
                                     b.textContent.trim().toLowerCase() === nextButton.text
                                 );
                    if (button) {
                        console.log('[JobAutoApply] Clicking next/review on resume step');
                        button.click();
                        await new Promise(res => setTimeout(res, 2000));
                        continue;
                    }
                }
            }

            // Find next action button based on context
            const actionButton = modalContent.visibleButtons.find(btn => {
                // Skip buttons we've already handled
                if (btn.text === 'done' || btn.text === 'dismiss') return false;
                
                // Look for submit button first - this indicates we're on the final step
                const isSubmitButton = btn.text.includes('submit') || 
                                     btn.ariaLabel.includes('submit application');
                
                if (isSubmitButton) {
                    // Flag that we're about to submit
                    submissionAttempted = true;
                    return true;
                }
                
                // Otherwise look for next/review/continue buttons
                return btn.text.includes('next') || 
                       btn.text.includes('review') || 
                       btn.text.includes('continue') ||
                       btn.ariaLabel.includes('next') || 
                       btn.ariaLabel.includes('review') || 
                       btn.ariaLabel.includes('continue') ||
                       (btn.isFooterButton && btn.classes.includes('artdeco-button--primary'));
            });

            if (!actionButton) {
                if (submissionAttempted) {
                    console.log('[JobAutoApply] No more action buttons found after submission attempt');
                    return true;
                }
                console.log('[JobAutoApply] No action buttons found');
                return false;
            }

            const button = modal.querySelector(`button[aria-label="${actionButton.ariaLabel}"]`) || 
                          Array.from(modal.querySelectorAll('button')).find(b => 
                              b.textContent.trim().toLowerCase() === actionButton.text
                          );
            if (button) {
                console.log('[JobAutoApply] Clicking button:', actionButton.text);
                button.click();
                
                // If this was a submit button, wait longer and try to close the success modal
                if (submissionAttempted) {
                    console.log('[JobAutoApply] Submit button detected, waiting for success modal...');
                    await new Promise(res => setTimeout(res, 3000));
                    
                    // Try to find and click the Done button first with enhanced selectors
                    const doneButton = Array.from(modal.querySelectorAll('button')).find(btn => {
                        const buttonText = btn.textContent.trim().toLowerCase();
                        const spanElement = btn.querySelector('span.artdeco-button__text');
                        const spanText = spanElement?.textContent.trim().toLowerCase() || '';
                        const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
                        
                        return buttonText === 'done' || 
                               spanText === 'done' ||
                               ariaLabel.includes('done') ||
                               btn.closest('button[aria-label*="done" i]') !== null;
                    });
                    
                    if (doneButton) {
                        console.log('[JobAutoApply] Found Done button after submission');
                        doneButton.click();
                        await new Promise(res => setTimeout(res, 1000));
                    }
                    
                    // If modal is still visible, try pressing Escape
                    if (document.contains(modal) && modal.offsetParent) {
                        console.log('[JobAutoApply] Trying Escape key to close modal');
                        document.dispatchEvent(new KeyboardEvent('keydown', {
                            key: 'Escape',
                            code: 'Escape',
                            keyCode: 27,
                            which: 27,
                            bubbles: true
                        }));
                        await new Promise(res => setTimeout(res, 1000));
                    }
                    
                    return true;
                }
                
                await new Promise(res => setTimeout(res, 2000));
            }
        }

        return false;
    }

    async findDoneButton(modal) {
        // Wait a moment for any animations to complete
        await new Promise(res => setTimeout(res, 1000));

        // First try finding the button in a success message container
        const successSection = Array.from(modal.querySelectorAll('section')).find(section => 
            section.textContent.includes('application was sent') ||
            section.textContent.includes('can keep track of your application')
        );

        if (successSection) {
            const doneButton = Array.from(successSection.querySelectorAll('button')).find(btn => 
                btn.textContent.trim().toLowerCase() === 'done'
            );
            if (doneButton) {
                console.log('[JobAutoApply] Found Done button in success message');
                return doneButton;
            }
        }

        // Try all possible button selectors
        const doneSelectors = [
            'button.artdeco-modal__dismiss',
            'button.artdeco-button--primary',
            'button[data-control-name="dismiss_application_modal"]',
            'button[aria-label="Dismiss"]',
            'button[aria-label="Done"]'
        ];

        // Try direct selectors
        for (const selector of doneSelectors) {
            const buttons = Array.from(modal.querySelectorAll(selector));
            const doneButton = buttons.find(btn => 
                btn.textContent.trim().toLowerCase() === 'done' ||
                btn.getAttribute('aria-label')?.toLowerCase().includes('done')
            );
            if (doneButton) {
                console.log('[JobAutoApply] Found Done button using selector:', selector);
                return doneButton;
            }
        }

        // Try finding any button with "Done" text
        const allButtons = Array.from(modal.querySelectorAll('button'));
        const doneButton = allButtons.find(btn => {
            const text = btn.textContent.trim().toLowerCase();
            return text === 'done';
        });

        if (doneButton) {
            console.log('[JobAutoApply] Found Done button by exact text match');
            return doneButton;
        }

        console.log('[JobAutoApply] Could not find Done button');
        return null;
    }

    async trackSuccessfulApplication(jobDetails) {
        try {
            const result = await chrome.storage.local.get(['successfulApps']);
            const successfulApps = result.successfulApps || [];
            
            // Add new application with full details
            successfulApps.push({
                company: jobDetails.company,
                position: jobDetails.title || 'Unknown Position',
                location: jobDetails.location || 'Unknown Location',
                date: jobDetails.date,
                platform: this.platform
            });
            
            // Keep only the last 1000 applications to prevent storage issues
            if (successfulApps.length > 1000) {
                successfulApps.shift(); // Remove oldest entry
            }
            
            await chrome.storage.local.set({ successfulApps });
            console.log('[JobAutoApply] Tracked application for:', jobDetails.company);
        } catch (error) {
            console.error('[JobAutoApply] Error saving application to storage:', error);
        }
    }

    // Form handling methods moved to FormHandler class

    async handleEmptyFields(emptyFields) {
        let anyFieldsSkipped = false;
        
        for (const { field, fieldName, isRadioGroup } of emptyFields) {
            // Special handling for resume-related fields
            if (fieldName.toLowerCase().includes('resume') || 
                fieldName.toLowerCase().includes('cv')) {
                continue; // Skip resume fields - they'll be handled separately
            }
            
            console.log(`[JobAutoApply] Handling empty field: ${fieldName}`);
            
            // Try to find answer in local storage
            const answer = await this.findAnswerInStorage(fieldName);
            
            if (isRadioGroup) {
                const radioButtons = Array.from(field);
                if (answer) {
                    // Try to find and select the matching radio button
                    const matchingButton = radioButtons.find(radio => {
                        const label = this.findFieldLabel(radio);
                        const radioValue = label?.textContent?.trim() || radio.value;
                        return radioValue.toLowerCase() === answer.toLowerCase();
                    });
                    
                    if (matchingButton) {
                        matchingButton.checked = true;
                        matchingButton.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log(`[JobAutoApply] Auto-selected radio option "${answer}" for "${fieldName}"`);
                        continue;
                    }
                }
                
                // If no stored answer or no match found, prompt user
                const options = radioButtons.map(radio => {
                    const label = this.findFieldLabel(radio);
                    return {
                        value: radio.value,
                        text: label?.textContent?.trim() || radio.value
                    };
                });
                
                const userAnswer = await this.promptUserForDropdown(fieldName, options);
                if (userAnswer) {
                    const selectedRadio = radioButtons.find(radio => radio.value === userAnswer.value);
                    if (selectedRadio) {
                        selectedRadio.checked = true;
                        selectedRadio.dispatchEvent(new Event('change', { bubbles: true }));
                        await this.saveAnswerToStorage(fieldName, userAnswer.text);
                    }
                }
                continue;
            }

            // Handle regular fields
            if (answer) {
                // For dropdowns, find matching option with enhanced matching
                if (field.tagName === 'SELECT') {
                    const options = Array.from(field.options);
                    const matchingOption = this.findBestMatchingOption(options, answer);
                    if (matchingOption) {
                        field.value = matchingOption.value;
                        console.log(`[JobAutoApply] Auto-filled dropdown "${fieldName}" with "${matchingOption.text}"`);
                    } else {
                        // If no match found, always prompt for dropdowns
                        console.log(`[JobAutoApply] No match found for ${fieldName}, prompting user`);
                        const userAnswer = await this.promptUserForDropdown(fieldName, options);
                        if (userAnswer) {
                            await this.saveAnswerToStorage(fieldName, userAnswer.text);
                            field.value = userAnswer.value;
                        }
                    }
                } else {
                    // Regular input field
                    field.value = answer;
                    console.log(`[JobAutoApply] Auto-filled field "${fieldName}"`);
                }
                
                // Trigger both events for better compatibility
                field.dispatchEvent(new Event('input', { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));
                await new Promise(res => setTimeout(res, 500)); // Small delay after field fill
            } else {
                // Prompt user for answer
                const userAnswer = field.tagName === 'SELECT' 
                    ? await this.promptUserForDropdown(fieldName, Array.from(field.options))
                    : await this.promptUserForAnswer(fieldName);
                    
                if (userAnswer) {
                    if (field.tagName === 'SELECT') {
                        await this.saveAnswerToStorage(fieldName, userAnswer.text);
                        field.value = userAnswer.value;
                    } else {
                        await this.saveAnswerToStorage(fieldName, userAnswer);
                        field.value = userAnswer;
                    }
                    field.dispatchEvent(new Event('input', { bubbles: true }));
                    field.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }
    }

    findBestMatchingOption(options, answer) {
        // First try exact match
        let match = options.find(opt => 
            opt.text.toLowerCase() === answer.toLowerCase() ||
            opt.value.toLowerCase() === answer.toLowerCase()
        );
        
        if (!match) {
            // Then try includes match
            match = options.find(opt => 
                opt.text.toLowerCase().includes(answer.toLowerCase()) ||
                answer.toLowerCase().includes(opt.text.toLowerCase()) ||
                opt.value.toLowerCase().includes(answer.toLowerCase()) ||
                answer.toLowerCase().includes(opt.value.toLowerCase())
            );
        }
        
        if (!match && answer.length > 3) {
            // Try partial word matching for longer answers
            const answerWords = answer.toLowerCase().split(/\s+/);
            match = options.find(opt => {
                const optWords = opt.text.toLowerCase().split(/\s+/);
                return answerWords.some(word => 
                    word.length > 3 && // Only match on words longer than 3 chars
                    optWords.some(optWord => 
                        optWord.includes(word) || word.includes(optWord)
                    )
                );
            });
        }
        
        return match;
    }

    async findAnswerInStorage(fieldName) {
        // First check userData cache
        if (this.userDataCache) {
            const lowercaseFieldName = fieldName.toLowerCase();
            
            // Map common field names to userData keys
            const fieldMappings = {
                'first name': 'firstName',
                'last name': 'lastName',
                'full name': 'name',
                'email': 'email',
                'phone': 'phone',
                'location': 'location',
                'current title': 'currentTitle',
                'current company': 'currentCompany',
                'experience': 'experience',
                'years of experience': 'yearsOfExperience',
                'education': 'education',
                'linkedin': 'linkedin',
                'website': 'website',
                'github': 'github',
                'expected salary': 'salaryExpectation',
                'notice period': 'noticePeriod'
            };

            const mappedKey = fieldMappings[lowercaseFieldName];
            if (mappedKey && this.userDataCache[mappedKey]) {
                return this.userDataCache[mappedKey];
            }
        }

        // Then check answers storage
        const result = await chrome.storage.local.get(['formAnswers']);
        const answers = result.formAnswers || {};
        return answers[fieldName];
    }

    async saveAnswerToStorage(fieldName, answer) {
        const result = await chrome.storage.local.get(['formAnswers']);
        const answers = result.formAnswers || {};
        answers[fieldName] = answer;
        await chrome.storage.local.set({ formAnswers: answers });
    }

    async promptUserForAnswer(fieldName) {
        return new Promise(resolve => {
            const answer = window.prompt(
                `Please provide an answer for "${fieldName}". This will be saved for future use.\nClick Cancel to skip this field.`
            );
            resolve(answer);
        });
    }

    async promptUserForDropdown(fieldName, options) {
        return new Promise(resolve => {
            const optionsText = options
                .map((opt, index) => `${index + 1}: ${opt.text}`)
                .join('\n');
                
            const prompt = `Please select an option for "${fieldName}" by entering the number:\n\n${optionsText}\n\nClick Cancel to skip this field.`;
            const response = window.prompt(prompt);
            
            if (response === null) {
                resolve(null);
            } else {
                const index = parseInt(response) - 1;
                if (index >= 0 && index < options.length) {
                    resolve({ value: options[index].value, text: options[index].text });
                } else {
                    resolve(null);
                }
            }
        });
    }

    tryLoadMoreJobs() {
        console.log('[JobAutoApply] Attempting to load more jobs...');
        window.scrollTo(0, document.body.scrollHeight);
        
        // Click "Show more jobs" button if it exists
        const showMoreButton = Array.from(document.querySelectorAll('button')).find(btn => 
            btn.textContent.toLowerCase().includes('show more')
        );
        
        if (showMoreButton) {
            console.log('[JobAutoApply] Clicking "Show more jobs" button');
            showMoreButton.click();
        }
    }

    isResumeField(field) {
        if (field.type !== 'file') return false;

        const container = field.closest('div, section, form');
        const containerText = container?.textContent.toLowerCase() || '';
        const fieldName = this.findFieldLabel(field)?.textContent.trim() || field.name || field.id || '';
        const fieldNameLower = fieldName.toLowerCase();
        
        // Check for resume-related attributes
        const isResumeField = 
            fieldNameLower.includes('resume') ||
            fieldNameLower.includes('cv') ||
            containerText.includes('resume') ||
            containerText.includes('cv') ||
            field.accept?.toLowerCase().includes('pdf') ||
            field.accept?.toLowerCase().includes('doc') ||
            field.getAttribute('aria-label')?.toLowerCase().includes('resume');

        if (isResumeField) {
            console.log('[JobAutoApply] Identified resume field:', {
                fieldName,
                containerText: containerText.substring(0, 50),
                accept: field.accept
            });
        }

        return isResumeField;
    }
}

// Initialize when the script loads
new JobAutoApply();
