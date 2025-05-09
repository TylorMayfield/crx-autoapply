// Form handling related functions
export class FormHandler {
    constructor(userDataCache) {
        this.userDataCache = userDataCache;
    }

    isFieldEmpty(field) {
        // For select elements (dropdowns)
        if (field.tagName === 'SELECT') {
            const firstOption = field.options[0];
            const isPlaceholderOption = firstOption && (
                firstOption.value === '' || 
                firstOption.value === '-1' || 
                firstOption.value === '0' ||
                firstOption.text.toLowerCase().includes('select') ||
                firstOption.text.toLowerCase().includes('choose')
            );
            
            return !field.value || 
                   field.value === '' || 
                   field.value === '-1' ||
                   (field.selectedIndex === 0 && isPlaceholderOption);
        }
        // For regular input fields
        return !field.value;
    }

    findFieldLabel(field) {
        // Try finding label by for attribute
        if (field.id) {
            const label = document.querySelector(`label[for="${field.id}"]`);
            if (label) return label;
        }
        
        // Try finding label as parent or ancestor
        let element = field.parentElement;
        while (element) {
            const label = element.querySelector('label');
            if (label) return label;
            element = element.parentElement;
        }
        
        return null;
    }

    findEmptyFormFields(modal) {
        const emptyFields = [];
        const formFields = modal.querySelectorAll('input:not([type="hidden"]), textarea, select');
        
        // Track radio button groups we've already processed
        const processedRadioGroups = new Set();
        
        for (const field of formFields) {
            // Skip resume upload fields
            if (field.type === 'file' && this.isResumeField(field)) {
                continue;
            }

            // Special handling for radio button groups
            if (field.type === 'radio') {
                const name = field.name;
                if (!processedRadioGroups.has(name)) {
                    processedRadioGroups.add(name);
                    const radioGroup = modal.querySelectorAll(`input[type="radio"][name="${name}"]`);
                    const isGroupEmpty = !Array.from(radioGroup).some(radio => radio.checked);
                    
                    if (isGroupEmpty && !field.disabled && field.style.display !== 'none') {
                        const container = field.closest('fieldset, div');
                        const legend = container?.querySelector('legend');
                        const groupLabel = legend || 
                                         container?.querySelector('label') || 
                                         this.findFieldLabel(field);
                        const fieldName = groupLabel?.textContent?.trim() || field.name;
                        emptyFields.push({ 
                            field: radioGroup, 
                            fieldName,
                            isRadioGroup: true 
                        });
                    }
                }
                continue;
            }

            // Regular field handling
            if (this.isFieldEmpty(field) && !field.disabled && field.style.display !== 'none') {
                const labelElement = this.findFieldLabel(field);
                const fieldName = labelElement?.textContent?.trim() || field.name || field.id;
                emptyFields.push({ field, fieldName });
            }
        }
        
        return emptyFields;
    }

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
