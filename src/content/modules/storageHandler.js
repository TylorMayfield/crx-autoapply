// Storage and user interaction related functions
export class StorageHandler {
    constructor() {
        this.fieldMappings = {
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
    }

    async findAnswerInStorage(fieldName, userDataCache) {
        // First check userData cache
        if (userDataCache) {
            const lowercaseFieldName = fieldName.toLowerCase();
            const mappedKey = this.fieldMappings[lowercaseFieldName];
            if (mappedKey && userDataCache[mappedKey]) {
                return userDataCache[mappedKey];
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

    async trackSuccessfulApplication(jobDetails, platform) {
        try {
            const result = await chrome.storage.local.get(['successfulApps']);
            const successfulApps = result.successfulApps || [];
            
            successfulApps.push({
                company: jobDetails.company,
                position: jobDetails.title || 'Unknown Position',
                location: jobDetails.location || 'Unknown Location',
                date: jobDetails.date,
                platform
            });
            
            // Keep only the last 1000 applications
            if (successfulApps.length > 1000) {
                successfulApps.shift();
            }
            
            await chrome.storage.local.set({ successfulApps });
            console.log('[JobAutoApply] Tracked application for:', jobDetails.company);
        } catch (error) {
            console.error('[JobAutoApply] Error saving application to storage:', error);
        }
    }

    promptForAnswer(fieldName) {
        return new Promise(resolve => {
            const answer = window.prompt(
                `Please provide an answer for "${fieldName}". This will be saved for future use.\nClick Cancel to skip this field.`
            );
            resolve(answer);
        });
    }

    promptForDropdown(fieldName, options) {
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
}
