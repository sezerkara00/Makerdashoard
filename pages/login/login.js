const { ipcRenderer } = require('electron');

// ─── Credentials (değiştirmek için buraya düzenle) ───────────────────────────
const VALID_USERS = [
    { username: 'admin',  password: 'admin123' },
    { username: 'sezer',  password: '1234' },
];

// ─── DOM References ──────────────────────────────────────────────────────────
const form        = document.getElementById('login-form');
const usernameEl  = document.getElementById('username-input');
const passwordEl  = document.getElementById('password-input');
const rememberEl  = document.getElementById('remember-me');
const loginBtn    = document.getElementById('login-btn');
const loginBtnTxt = document.getElementById('login-btn-text');
const spinner     = document.getElementById('login-spinner');
const errorMsg    = document.getElementById('error-msg');
const errorText   = document.getElementById('error-text');
const togglePwBtn = document.getElementById('toggle-pw-btn');
const eyeIcon     = document.getElementById('eye-icon');

// ─── Remember Me — Pre-fill ──────────────────────────────────────────────────
const savedUser = localStorage.getItem('lt_remember_user');
if (savedUser) {
    usernameEl.value = savedUser;
    rememberEl.checked = true;
}

// ─── Show/Hide Password ──────────────────────────────────────────────────────
togglePwBtn.addEventListener('click', () => {
    const isHidden = passwordEl.type === 'password';
    passwordEl.type = isHidden ? 'text' : 'password';
    eyeIcon.innerHTML = isHidden
        ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`
        : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
});

// ─── Error helper ────────────────────────────────────────────────────────────
function showError(msg) {
    errorText.textContent = msg;
    errorMsg.classList.remove('hidden');
    // Re-trigger shake animation
    errorMsg.style.animation = 'none';
    requestAnimationFrame(() => { errorMsg.style.animation = ''; });
}

function clearError() {
    errorMsg.classList.add('hidden');
}

// ─── Input events — clear error on type ─────────────────────────────────────
usernameEl.addEventListener('input', clearError);
passwordEl.addEventListener('input', clearError);

// ─── Skip Button ─────────────────────────────────────────────────────────────
document.getElementById('skip-btn').addEventListener('click', () => {
    ipcRenderer.send('login-success');
});

// ─── Form Submit ─────────────────────────────────────────────────────────────
form.addEventListener('submit', (e) => {
    e.preventDefault();

    const username = usernameEl.value.trim();
    const password = passwordEl.value;

    if (!username) {
        showError('Please enter your username.');
        usernameEl.focus();
        return;
    }
    if (!password) {
        showError('Please enter your password.');
        passwordEl.focus();
        return;
    }

    // Show loading state
    loginBtn.disabled = true;
    loginBtnTxt.textContent = 'Signing in...';
    spinner.classList.remove('hidden');
    clearError();

    // Simulate small delay for UX feel
    setTimeout(() => {
        const match = VALID_USERS.find(
            u => u.username === username && u.password === password
        );

        if (match) {
            // Save remember me
            if (rememberEl.checked) {
                localStorage.setItem('lt_remember_user', username);
            } else {
                localStorage.removeItem('lt_remember_user');
            }

            // Navigate to dashboard
            ipcRenderer.send('login-success');
        } else {
            loginBtn.disabled = false;
            loginBtnTxt.textContent = 'Sign In';
            spinner.classList.add('hidden');
            showError('Invalid username or password.');
            passwordEl.value = '';
            passwordEl.focus();
        }
    }, 600);
});

// ─── Footer links ────────────────────────────────────────────────────────────
const contactLink = document.getElementById('contact-link');
const supportPopover = document.getElementById('support-popover');

if (contactLink && supportPopover) {
    contactLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        supportPopover.classList.toggle('hidden');
    });

    supportPopover.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Intercept channel link clicks and open in external browser
    const { shell } = require('electron');
    supportPopover.querySelectorAll('.support-channel-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const href = item.getAttribute('href');
            if (href) {
                shell.openExternal(href);
            }
        });
    });

    window.addEventListener('click', () => {
        if (!supportPopover.classList.contains('hidden')) {
            supportPopover.classList.add('hidden');
        }
    });
}

document.getElementById('wiki-link').addEventListener('click', (e) => {
    e.preventDefault();
    require('electron').shell.openExternal('https://wiki.layerstech.website/home/');
});

