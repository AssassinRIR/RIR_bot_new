document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    const settingsBtn = document.querySelector('.settings-btn');
    const settingsModal = document.getElementById('settingsModal');
    const closeButton = settingsModal.querySelector('.close-button');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const fullScreenToggleBtn = document.querySelector('.full-screen-toggle-btn');
    const promptInput = document.querySelector('.prompt-input');
    const sendBtn = document.querySelector('.send-btn');
    const chatDisplay = document.querySelector('.chat-display');
    const toolToggleBtns = document.querySelectorAll('.tool-toggle-btn');
    const newChatBtn = document.querySelector('.new-chat-btn');
    const chatTitle = document.querySelector('.chat-title');
    const currentDateTimeElement = document.getElementById('current-datetime'); // Get the new element

    // --- 1. Settings Modal & Dark Mode Toggle ---
    settingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'flex'; // Show modal
    });

    closeButton.addEventListener('click', () => {
        settingsModal.style.display = 'none'; // Hide modal
    });

    // Close modal if user clicks outside of it
    window.addEventListener('click', (event) => {
        if (event.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    // Dark Mode Toggle inside modal
    darkModeToggle.addEventListener('change', () => {
        if (darkModeToggle.checked) {
            body.classList.add('dark-mode');
            localStorage.setItem('theme', 'dark');
        } else {
            body.classList.remove('dark-mode');
            localStorage.setItem('theme', 'light');
        }
    });

    // Apply saved theme on load
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        body.classList.add('dark-mode');
        darkModeToggle.checked = true; // Ensure toggle reflects state
    } else {
        darkModeToggle.checked = false;
    }

    // --- Current Date & Time Functionality (for sidebar display) ---
    function updateDateTime() {
        const now = new Date();
        const optionsDate = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const optionsTime = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
        const dateString = now.toLocaleDateString(undefined, optionsDate);
        const timeString = now.toLocaleTimeString(undefined, optionsTime);
        if (currentDateTimeElement) { // Check if element exists before updating
            currentDateTimeElement.innerHTML = `${dateString}<br>${timeString}`; // Update innerHTML
        }
    }

    // Call it once to display immediately
    updateDateTime();
    // Update every second
    setInterval(updateDateTime, 1000);


    // --- 2. Full-Screen Toggle ---
    fullScreenToggleBtn.addEventListener('click', () => {
        body.classList.toggle('full-screen');
        const icon = fullScreenToggleBtn.querySelector('i');
        if (body.classList.contains('full-screen')) {
            icon.classList.remove('fa-expand');
            icon.classList.add('fa-compress');
        } else {
            icon.classList.remove('fa-compress');
            icon.classList.add('fa-expand');
        }
    });

    // --- 3. Auto-resize Textarea ---
    promptInput.addEventListener('input', () => {
        promptInput.style.height = 'auto';
        promptInput.style.height = promptInput.scrollHeight + 'px';
    });

    // --- 4. Send Message (Integrated with Netlify Function) ---
    sendBtn.addEventListener('click', () => {
        sendMessage();
    });

    promptInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Function to append a thinking message
    function appendThinkingMessage() {
        const thinkingDiv = document.createElement('div');
        thinkingDiv.classList.add('message', 'ai-message', 'thinking-indicator');
        thinkingDiv.innerHTML = `
            <p>RiRs Bot is thinking<span class="typing-dot">.</span><span class="typing-dot">.</span><span class="typing-dot">.</span></p>
            <span class="timestamp">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        `;
        chatDisplay.appendChild(thinkingDiv);
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
    }

    // Function to remove the thinking message
    function removeThinkingMessage() {
        const thinkingDiv = chatDisplay.querySelector('.thinking-indicator');
        if (thinkingDiv) {
            thinkingDiv.remove();
        }
    }


    async function sendMessage() {
        const messageText = promptInput.value.trim();
        if (messageText) {
            appendMessage(messageText, 'user');
            promptInput.value = '';
            promptInput.style.height = 'auto';

            appendThinkingMessage(); // Show thinking indicator

            let providerToSend = 'gemini'; // Default AI provider
            let payloadMessage = messageText; // What to send as 'message' or 'query'

            // Check if Web Browse tool is active
            const webToolBtn = document.querySelector('.tool-toggle-btn[data-tool="web"]');
            if (webToolBtn && webToolBtn.classList.contains('active')) {
                providerToSend = 'brave';
                payloadMessage = messageText; // For Brave, the user's message is the query
                appendSystemMessage('Initiating web search with Brave...'); // Add clear feedback
                console.log("Web tool is active. Preparing to send to Brave API with query:", payloadMessage); // Debug log
            } else {
                console.log("Web tool is NOT active. Preparing to send to default AI provider:", providerToSend); // Debug log
            }

            // Construct payload based on provider
            let requestBody;
            if (providerToSend === 'brave') {
                requestBody = JSON.stringify({ query: payloadMessage, provider: 'brave' });
            } else {
                requestBody = JSON.stringify({ message: payloadMessage, provider: providerToSend });
            }

            console.log("Sending API request with body:", requestBody); // Debug log

            // Make API call to your Netlify function
            fetch('/.netlify/functions/ai', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: requestBody,
            })
            .then(response => {
                removeThinkingMessage(); // Remove thinking indicator
                if (!response.ok) {
                    return response.json().then(err => {
                        console.error('API Error Response:', err); // Log the full error from backend
                        throw new Error(err.error || `Unknown API error (Status: ${response.status})`);
                    });
                }
                return response.json();
            })
            .then(data => {
                appendMessage(data.reply, 'ai'); // Now, data.reply will be parsed as markdown
                // Deactivate web tool after use, if it's a one-off search per query
                if (providerToSend === 'brave' && webToolBtn) { // Check webToolBtn exists
                    webToolBtn.classList.remove('active');
                    appendSystemMessage('Web search completed. Web Browse is now inactive.');
                }
            })
            .catch(error => {
                console.error('Error fetching AI response:', error);
                removeThinkingMessage(); // Remove thinking indicator on error
                appendSystemMessage('Error: Could not get a response. ' + error.message);
                // Ensure web tool is deactivated on error too, if it was active
                if (providerToSend === 'brave' && webToolBtn && webToolBtn.classList.contains('active')) {
                    webToolBtn.classList.remove('active');
                }
            });
        }
    }

    function appendMessage(text, sender, imageUrl = null) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender + '-message');

        const paragraph = document.createElement('p');

        // *** THIS IS THE KEY CHANGE FOR MARKDOWN RENDERING ***
        // Use marked.parse() to convert markdown string to HTML string
        // The marked.js library must be included in your index.html
        paragraph.innerHTML = marked.parse(text); // This renders markdown (including code blocks) as HTML

        messageDiv.appendChild(paragraph);

        if (imageUrl) {
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = 'Generated or uploaded image';
            img.classList.add('chat-image');
            messageDiv.appendChild(img);
        }

        const timestamp = document.createElement('span');
        timestamp.classList.add('timestamp');
        timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        messageDiv.appendChild(timestamp);

        const actionsDiv = document.createElement('div');
        actionsDiv.classList.add('message-actions');
        actionsDiv.innerHTML = `
            <button><i class="fas fa-star"></i></button>
            <button><i class="fas fa-copy"></i></button>
            ${sender === 'ai' ? '<button><i class="fas fa-redo"></i></button>' : ''}
        `;
        messageDiv.appendChild(actionsDiv);

        chatDisplay.appendChild(messageDiv);
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
    }

    // --- 5. Tool Toggles (Conceptual) ---
    toolToggleBtns.forEach(button => {
        button.addEventListener('click', () => {
            const tool = button.dataset.tool;
            button.classList.toggle('active');

            let systemMessageText = '';

            // In a real app, this would trigger actual tool activation/deactivation logic
            if (tool === 'voice') {
                systemMessageText = button.classList.contains('active') ? 'Voice input enabled.' : 'Voice input disabled.';
                // Placeholder for Web Speech API
            } else if (tool === 'file') {
                systemMessageText = 'Opening file dialog...';
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.multiple = true;
                fileInput.accept = '.pdf,.doc,.docx,.txt,.csv,.jpg,.jpeg,.png,.gif';
                fileInput.style.display = 'none';
                document.body.appendChild(fileInput);

                fileInput.addEventListener('change', (event) => {
                    const files = event.target.files;
                    if (files.length > 0) {
                        let fileNames = Array.from(files).map(f => f.name).join(', ');
                        appendSystemMessage(`Uploaded files: ${fileNames}. Processing...`);
                        // Logic to send files to backend/AI for processing
                    }
                    document.body.removeChild(fileInput);
                });
                fileInput.click();
            } else if (tool === 'image') {
                if (button.classList.contains('active')) {
                    const choice = confirm("Press OK to describe an image for AI generation, or Cancel to upload an image.");
                    if (choice) {
                        const description = prompt("Enter description for image generation:");
                        if (description) {
                            appendSystemMessage(`Requesting AI image generation: "${description}".`);
                            // Simulate generated image
                            setTimeout(() => {
                                appendMessage(`Here's an image based on "${description}"`, "ai", "https://via.placeholder.com/300x200?text=AI+Image");
                            }, 1500);
                        } else {
                            systemMessageText = 'Image generation cancelled.';
                            button.classList.remove('active'); // Deactivate if no description
                        }
                    } else { // User chose to upload
                        const imageInput = document.createElement('input');
                        imageInput.type = 'file';
                        imageInput.accept = 'image/*';
                        imageInput.style.display = 'none';
                        document.body.appendChild(imageInput);
                        imageInput.addEventListener('change', (event) => {
                            const file = event.target.files[0];
                            if (file) {
                                const reader = new FileReader();
                                reader.onload = (e) => {
                                    appendSystemMessage(`Uploaded image: ${file.name}.`);
                                    appendMessage("I received your image.", "ai", e.target.result); // Display it
                                };
                                reader.readAsDataURL(file);
                            }
                            document.body.removeChild(imageInput);
                        });
                        imageInput.click();
                    }
                } else {
                    systemMessageText = 'Image tools disabled.';
                }
            } else if (tool === 'code') {
                systemMessageText = button.classList.contains('active') ? 'Code interpreter active.' : 'Code interpreter inactive.';
            } else if (tool === 'web') {
                systemMessageText = button.classList.contains('active') ? 'Web Browse active.' : 'Web Browse inactive.';
            }

            if (systemMessageText) {
                appendSystemMessage(systemMessageText);
            }
        });
    });

    function appendSystemMessage(text) {
        let systemMessageDiv = chatDisplay.querySelector('.system-message');
        if (!systemMessageDiv) {
            systemMessageDiv = document.createElement('div');
            systemMessageDiv.classList.add('system-message');
            chatDisplay.prepend(systemMessageDiv);
        }
        systemMessageDiv.textContent = text;
        systemMessageDiv.style.display = 'block';
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
    }


    // --- 6. New Chat Button (Basic) ---
    newChatBtn.addEventListener('click', () => {
        chatDisplay.innerHTML = '';
        promptInput.value = '';
        chatTitle.textContent = 'New Conversation';
        promptInput.style.height = 'auto';
        toolToggleBtns.forEach(btn => btn.classList.remove('active'));
        appendSystemMessage('New conversation started. Tools reset.');
    });

    // --- 7. Chat History (Conceptual) ---
    const chatItems = document.querySelectorAll('.chat-item');
    chatItems.forEach(item => {
        item.addEventListener('click', () => {
            chatItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            chatTitle.textContent = item.querySelector('span').textContent;
            chatDisplay.innerHTML = '';
            appendSystemMessage(`Loaded conversation: "${item.querySelector('span').textContent}"`);
            // In a real app, you'd fetch the chat history from your backend based on item.dataset.chatId
        });
    });

    // --- 8. Star/Pin Messages (Conceptual) ---
    chatDisplay.addEventListener('click', (event) => {
        const starButton = event.target.closest('.message-actions button i.fa-star');
        if (starButton) {
            const messageDiv = starButton.closest('.message');
            messageDiv.classList.toggle('starred');
            starButton.classList.toggle('fas');
            starButton.classList.toggle('far');
            appendSystemMessage(messageDiv.classList.contains('starred') ? 'Message starred!' : 'Message unstarred.');
        }
    });

    // --- 9. Drag and Drop for File Upload ---
    promptInput.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        promptInput.style.borderColor = 'var(--accent-color-light)';
    });

    promptInput.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        promptInput.style.borderColor = 'var(--border-color-light)';
    });

    promptInput.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        promptInput.style.borderColor = 'var(--border-color-light)';

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            let fileNames = Array.from(files).map(f => f.name).join(', ');
            appendSystemMessage(`Dropped files: ${fileNames}. Preparing for upload...`);
        }
    });

    // --- 10. Accessibility: Font Size Slider (Conceptual) ---
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    if (fontSizeSlider) {
        fontSizeSlider.addEventListener('input', (event) => {
            document.body.style.fontSize = `${event.target.value}px`;
            localStorage.setItem('fontSize', event.target.value);
        });

        // Apply saved font size on load
        const savedFontSize = localStorage.getItem('fontSize');
        if (savedFontSize) {
            document.body.style.fontSize = `${savedFontSize}px`;
            fontSizeSlider.value = savedFontSize;
        }
    }

    // --- 11. Theme Selector Buttons ---
    const themeButtons = document.querySelectorAll('.theme-btn');
    if (themeButtons.length) {
        themeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Remove all neon theme classes
                body.classList.remove('neon-red', 'neon-blue', 'neon-white', 'neon-yellow', 'neon-green');
                // Add the selected theme
                const theme = btn.getAttribute('data-theme');
                if (theme) {
                    body.classList.add(theme);
                    localStorage.setItem('neonTheme', theme);
                } else {
                    localStorage.removeItem('neonTheme');
                }
            });
        });
        // Apply saved neon theme on load
        const savedNeonTheme = localStorage.getItem('neonTheme');
        if (savedNeonTheme) {
            body.classList.remove('neon-red', 'neon-blue', 'neon-white', 'neon-yellow', 'neon-green');
            body.classList.add(savedNeonTheme);
        }
    }

    // Add initial system message if needed
    if (chatDisplay.children.length === 0) {
        appendSystemMessage('Welcome to RiRs Bot! How can I assist you today?');
    }
});