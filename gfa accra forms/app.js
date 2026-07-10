// Global Error Handler for Debugging (Defined first to catch all errors)
window.onerror = function(msg, url, line, col, error) {
    console.error("Global Error:", msg, "at", line, ":", col);
    const errDiv = document.getElementById('login-error');
    if (errDiv) {
        errDiv.innerText = "System Error: " + msg + " (Line: " + line + ")";
        errDiv.style.display = 'block';
    }
    return false;
};

// Firebase Configuration
const firebaseConfig = {
    databaseURL: 'https://gfa-admission-forms-default-rtdb.firebaseio.com/',
};

let db = null;
try {
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        db = firebase.database();
    } else {
        console.warn("Firebase SDK not detected. Operating in offline mode.");
    }
} catch (e) {
    console.error("Firebase Initialization Error:", e);
}

console.log("GFA Admission Portal: Script Loaded.");

// Database State
let GFA_DB = []; 
let currentActiveRecord = null;
let cachedPassportDataUrl = null;
let cachedPassportFileName = null;

/**
 * Initialize Database
 * Prioritizes LocalStorage for persistent "used" status on the device.
 * Falls back to pins.js (defaultPins) if LocalStorage is empty.
 */
function initDatabase() {
    const STORAGE_KEY = 'gfa_database_v3';
    
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            GFA_DB = JSON.parse(stored);
            console.log("Database loaded from LocalStorage:", GFA_DB.length, "pins.");
        } else if (typeof defaultPins !== 'undefined' && Array.isArray(defaultPins)) {
            GFA_DB = defaultPins;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(GFA_DB));
            console.log("Database initialized from pins.js:", GFA_DB.length, "pins.");
        } else {
            console.error("Critical Error: defaultPins not found and LocalStorage is empty.");
            GFA_DB = [];
        }
    } catch (e) {
        console.warn("Storage access error, using in-memory fallback.", e);
        GFA_DB = (typeof defaultPins !== 'undefined') ? defaultPins : [];
    }
}

function timeoutPromise(promise, ms, defaultValue = null) {
    return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
            console.warn("Promise timed out after " + ms + "ms");
            resolve(defaultValue);
        }, ms);
        promise.then(
            (val) => {
                clearTimeout(timeoutId);
                resolve(val);
            },
            (err) => {
                clearTimeout(timeoutId);
                console.warn("Promise rejected:", err);
                resolve(defaultValue);
            }
        );
    });
}

async function backendLogin(serial, pin) {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serial, pin }),
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => null);
            console.warn('Backend login failed:', errData);
            return { valid: false };
        }
        return await response.json();
    } catch (error) {
        console.warn('Backend login request failed:', error);
        return { valid: false };
    }
}

async function backendSubmit(serial, pin, formData) {
    try {
        const response = await fetch('/api/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serial, pin, formData }),
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => null);
            console.warn('Backend submit failed:', errData);
            return { success: false, error: (errData && errData.error) || 'Server error' };
        }
        return await response.json();
    } catch (error) {
        console.warn('Backend submit request failed:', error);
        return { success: false, error: error.message };
    }
}

function firebaseKey(serial) {
    return (serial || '').toString().trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
}

async function savePinToFirebase(serial, pin, formData = null) {
    if (!db) return;
    try {
        const key = firebaseKey(serial);
        await db.ref('pins/' + key).set({ 
            serial, 
            pin, 
            used: true, 
            formData,
            updatedAt: new Date().toISOString() 
        });
    } catch (error) {
        console.warn('Firebase pin update failed:', error);
    }
}

async function saveAccraFormToFirebase(serial, formData = null) {
    if (!db) return;
    try {
        const key = firebaseKey(serial);
        const payload = {
            ...(formData || {}),
            serial,
            submittedAt: (formData && formData.submittedAt) || new Date().toISOString(),
        };
        await db.ref('accra_forms/' + key).set(payload);
        console.log('Saved application to admin accra_forms:', key);
    } catch (error) {
        console.warn('Firebase admin form save failed:', error);
    }
}

// --- AUTO-INITIALIZE ON LOAD ---
initDatabase();

// Function to setup all buttons when DOM is ready
function setupButtons() {
    // Re-select all DOM elements to ensure they're available
    const gateSection = document.getElementById('gate-section');
    const formSection = document.getElementById('form-section');
    const successSection = document.getElementById('success-section');
    const loginError = document.getElementById('login-error');

    const inputSerial = document.getElementById('gate-serial');
    const inputPin = document.getElementById('gate-pin');
    const loginBtn = document.getElementById('btn-login');

    const form = document.getElementById('admission-form');
    const readOnlyBanner = document.getElementById('readonly-banner');
    const submitWrapper = document.getElementById('submit-wrapper');
    const readOnlyMsg = document.getElementById('read-only-msg');

    const fashionBgRadios = document.getElementsByName('first_time');
    const prevSchoolDiv = document.getElementById('previous-school-div');
    const currentSerialInput = document.getElementById('current-serial');
    const passportInputEl = document.getElementById('passport-upload');
    const previewImg = document.getElementById('preview-img');
    const previewText = document.getElementById('preview-text');
    const downloadBtn = document.getElementById('btn-download');
    const btnSubmit = document.getElementById('btn-submit');
    const btnOpenEmail = document.getElementById('btn-open-email');

    // Login Button Handler
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            console.log("Login button clicked.");
            const serialRaw = inputSerial.value || "";
            const pinRaw = inputPin.value || "";
            const normalizeSerial = (value) => (value || "").toString().trim().toUpperCase().replace(/\s+/g, '');
            const normalizePin = (value) => (value || "").toString().trim().replace(/\s+/g, '');
            const serial = normalizeSerial(serialRaw);
            const pin = normalizePin(pinRaw);

            if (!serial || !pin) {
                loginError.innerText = "Please enter both Serial and PIN.";
                loginError.style.display = 'block';
                return;
            }

            loginBtn.innerText = "Verifying...";
            loginBtn.disabled = true;
            loginError.style.display = 'none';

            try {
                if (!Array.isArray(GFA_DB) || GFA_DB.length === 0) {
                    initDatabase();
                }

                let localRecord = GFA_DB.find(u => {
                    const dbSerial = (u.serial || "").toString().trim().toUpperCase().replace(/\s+/g, '');
                    const dbPin = (u.pin || "").toString().trim().replace(/\s+/g, '');
                    return dbSerial === serial && dbPin === pin;
                });

                // Check Firebase first if database is available
                let firebaseRecord = null;
                if (db) {
                    try {
                        const key = firebaseKey(serial);
                        const fbPromise = db.ref('pins/' + key).once('value').then(snap => snap.val());
                        firebaseRecord = await timeoutPromise(fbPromise, 1500, null);
                    } catch (e) {
                        console.warn("Firebase pin query failed:", e);
                    }
                }

                if (firebaseRecord) {
                    // Check if the pin matches the entered one
                    const fbPin = (firebaseRecord.pin || "").toString().trim().replace(/\s+/g, '');
                    if (fbPin !== pin) {
                        loginError.innerText = "Invalid Serial Number or PIN. Please check and try again.";
                        loginError.style.display = 'block';
                        return;
                    }

                    if (firebaseRecord.used) {
                        localRecord = localRecord || { serial, pin };
                        localRecord.used = true;
                        localRecord.formData = firebaseRecord.formData || localRecord.formData;
                        localRecord.submittedAt = firebaseRecord.updatedAt || firebaseRecord.submittedAt || localRecord.submittedAt;
                        
                        loginError.innerText = "This Serial Number and PIN have already been used. You may review the submitted application below.";
                        loginError.style.display = 'block';
                        
                        // Save to local storage cache
                        let idx = GFA_DB.findIndex(r => r.serial === serial);
                        if (idx > -1) {
                            GFA_DB[idx] = localRecord;
                        } else {
                            GFA_DB.push(localRecord);
                        }
                        try {
                            localStorage.setItem('gfa_database_v3', JSON.stringify(GFA_DB));
                        } catch (e) {}
                        
                        openForm(localRecord);
                        return;
                    }
                }

                const backendRecord = await backendLogin(serial, pin);

                if (backendRecord.valid && backendRecord.used) {
                    localRecord = localRecord || { serial, pin, used: true, formData: backendRecord.formData, submittedAt: backendRecord.submittedAt };
                    localRecord.used = true;
                    localRecord.formData = backendRecord.formData || localRecord.formData;
                    localRecord.submittedAt = backendRecord.submittedAt || localRecord.submittedAt;
                    loginError.innerText = "This Serial Number and PIN have already been used. You may review the submitted application below.";
                    loginError.style.display = 'block';
                    openForm(localRecord);
                } else if (localRecord) {
                    if (localRecord.used) {
                        loginError.innerText = "This Serial Number and PIN have already been used. You may review the submitted application below.";
                        loginError.style.display = 'block';
                    }
                    if (backendRecord.valid && backendRecord.formData) {
                        localRecord.formData = backendRecord.formData;
                        localRecord.used = backendRecord.used || localRecord.used;
                        localRecord.submittedAt = backendRecord.submittedAt || localRecord.submittedAt;
                    }
                    openForm(localRecord);
                } else {
                    loginError.innerText = "Invalid Serial Number or PIN. Please check and try again.";
                    loginError.style.display = 'block';
                }
            } catch (error) {
                console.error("Login Error:", error);
                loginError.innerText = "An error occurred: " + error.message;
                loginError.style.display = 'block';
            } finally {
                loginBtn.innerText = "Access Form";
                loginBtn.disabled = false;
            }
        });
    } else {
        console.error("Critical Error: Login button (btn-login) not found!");
    }

    // Submit Handler
    let isSubmitting = false;
    if (form) {
        const handleSubmit = async (e) => {
            e.preventDefault();
            if (isSubmitting) return;
            if (!form.reportValidity()) return;

            isSubmitting = true;
            if (btnSubmit) {
                btnSubmit.innerText = "Processing...";
                btnSubmit.style.pointerEvents = "none";
                btnSubmit.style.opacity = "0.7";
            }

            const formData = new FormData(form);
            const dataObj = {};
            for (const pair of formData.entries()) {
                const key = pair[0];
                const value = pair[1];
                dataObj[key] = (value && typeof value === "object" && "name" in value) ? value.name : value;
            }

            const serial = dataObj['current-serial'] || "";
            const pin = document.getElementById('hidden-pin').value || "";

            if (typeof cachedPassportFileName !== 'undefined' && cachedPassportFileName) dataObj._passportFileName = cachedPassportFileName;
            if (typeof cachedPassportDataUrl !== 'undefined' && cachedPassportDataUrl) dataObj._passportDataUrl = cachedPassportDataUrl;

            if (!Array.isArray(GFA_DB) || GFA_DB.length === 0) initDatabase();

            let index = GFA_DB.findIndex(r => (r.serial || "").toString().trim().toUpperCase() === serial);

            if (index > -1 && GFA_DB[index].used === true) {
                alert("Already submitted on this device.");
                openForm(GFA_DB[index]);
                window.scrollTo({ top: 0, behavior: 'smooth' });
                isSubmitting = false;
                if (btnSubmit) {
                    btnSubmit.innerText = "Submit Application";
                    btnSubmit.style.pointerEvents = "auto";
                    btnSubmit.style.opacity = "1";
                }
                return;
            }

            const submittedAt = new Date().toISOString();
            if (index > -1) {
                GFA_DB[index].used = true;
                GFA_DB[index].formData = dataObj;
                GFA_DB[index].submittedAt = submittedAt;
            } else {
                GFA_DB.push({ serial, pin, used: true, formData: dataObj, submittedAt });
            }

            try {
                localStorage.setItem('gfa_database_v3', JSON.stringify(GFA_DB));
            } catch (e) {
                console.warn("Local storage write failed:", e);
            }

            const subject = `Aslin Admission: ${dataObj.admission_batch || 'Batch'} - ${dataObj.firstname || 'Applicant'} ${dataObj.surname || ''} (${serial})`;
            const fsSubject = document.getElementById('fs-subject');
            if (fsSubject) fsSubject.value = subject;

            dataObj.submittedAt = submittedAt;
            dataObj.serial = serial;

            if (db) {
                try {
                    await savePinToFirebase(serial, pin, dataObj);
                } catch (fbErr) {
                    console.warn('Firebase save failed:', fbErr);
                }
                try {
                    await saveAccraFormToFirebase(serial, dataObj);
                } catch (accraErr) {
                    console.warn('Firebase admin form save failed:', accraErr);
                }
            }

            if (currentActiveRecord) {
                currentActiveRecord.used = true;
                currentActiveRecord.formData = dataObj;
                currentActiveRecord.submittedAt = submittedAt;
            } else {
                currentActiveRecord = { serial, pin, used: true, formData: dataObj, submittedAt };
            }

            const serialInput = document.getElementById('current-serial');
            if (serialInput) serialInput.value = serial;

            const hiddenPinInput = document.getElementById('hidden-pin');
            if (hiddenPinInput) hiddenPinInput.value = pin;

            const detailsInput = document.getElementById('fs-details');
            if (detailsInput) detailsInput.value = JSON.stringify(dataObj, null, 2);

            const fsSubjectInput = document.getElementById('fs-subject');
            if (fsSubjectInput) fsSubjectInput.value = subject;

            form.removeEventListener('submit', handleSubmit);
            form.submit();
        };

        form.addEventListener('submit', handleSubmit);
    } else {
        console.error("Critical Error: Admission form not found!");
    }

    // Download Button Handler
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            if (currentActiveRecord) downloadFilledForm(currentActiveRecord);
        });
    }

    // Email fallback button handler
    if (btnOpenEmail) {
        btnOpenEmail.addEventListener('click', () => {
            const applicantName = `${document.querySelector('input[name="surname"]')?.value || ''} ${document.querySelector('input[name="firstname"]')?.value || ''}`.trim();
            const applicantEmail = 'aslinfashionschoolonlineforms@gmail.com';
            const subject = document.getElementById('fs-subject')?.value || 'Aslin Admission Application';
            const details = document.getElementById('fs-details')?.value || 'Application submitted';
            const mailtoLink = `mailto:${applicantEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`Applicant: ${applicantName}\n\n${details}`)}`;
            window.open(mailtoLink, '_blank', 'noopener,noreferrer');
        });
    }

    // iPhone Safari fix:
    // Do NOT read the file (async) during submit, because Safari may block the submit
    // when it's no longer a direct user gesture. Cache the image when the user selects it.
    if (passportInputEl) {
        passportInputEl.addEventListener('change', () => {
            const file = passportInputEl.files && passportInputEl.files[0] ? passportInputEl.files[0] : null;
            cachedPassportDataUrl = null;
            cachedPassportFileName = null;
            if (!file) return;
            cachedPassportFileName = file.name;

            try {
                const reader = new FileReader();
                reader.onload = () => { cachedPassportDataUrl = String(reader.result || ""); };
                reader.onerror = () => {
                    cachedPassportDataUrl = null;
                    console.warn("Passport image could not be cached for download.");
                };
                reader.readAsDataURL(file);
            } catch (e) {
                cachedPassportDataUrl = null;
            }
        });
    }

    // Toggle Previous School Field
    Array.from(fashionBgRadios).forEach(radio => {
        radio.addEventListener('change', () => {
            if (document.getElementById('ft-no').checked) {
                prevSchoolDiv.classList.remove('hidden');
                document.querySelector('textarea[name="previous_school"]').required = true;
            } else {
                prevSchoolDiv.classList.add('hidden');
                document.querySelector('textarea[name="previous_school"]').required = false;
            }
        });
    });

    // Passport Preview Logic
    if (passportInputEl && previewImg && previewText) {
        passportInputEl.addEventListener('change', function () {
            if (this.files && this.files[0]) {
                const url = URL.createObjectURL(this.files[0]);
                previewImg.src = url;
                previewImg.style.display = 'block';
                previewText.style.display = 'none';
            } else {
                previewImg.style.display = 'none';
                previewText.style.display = 'inline';
            }
        });
    }
}

// Initialize buttons when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupButtons);
} else {
    setupButtons();
}



// Utility Functions
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function downloadFilledForm(record) {
    if (!record || !record.formData) {
        alert("No submitted form data found to download on this device.");
        return;
    }

    const safeSerial = (record.serial || "GFA").replace(/[^A-Z0-9_-]/gi, "_");
    const submittedAt = record.submittedAt || new Date().toISOString();
    const dataObj = record.formData;

    const passportDataUrl = dataObj._passportDataUrl;

    const getVal = (key) => escapeHtml(dataObj[key] || "N/A");

    const html = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>GFA Admission Form - ${safeSerial}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
        body { font-family: 'Outfit', sans-serif; margin: 0; padding: 40px; background: #f0f4f8; color: #1a202c; line-height: 1.4; }
        .form-container { max-width: 900px; margin: 0 auto; background: white; border: 1px solid #e2e8f0; padding: 40px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border-radius: 12px; position: relative; }
        
        .header { text-align: center; margin-bottom: 30px; border-bottom: 4px solid #003366; padding-bottom: 20px; position: relative; }
        .header h1 { color: #003366; font-size: 32px; margin: 0; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
        .header .sub-title { display: inline-block; background: #FFD700; color: #003366; padding: 6px 30px; border-radius: 50px; font-weight: 700; margin-top: 10px; font-size: 16px; text-transform: uppercase; }
        
        .section { margin-bottom: 20px; border: 1.5px solid #003366; border-radius: 8px; overflow: hidden; }
        .section-header { background: #003366; color: white; padding: 8px 15px; font-weight: 700; font-size: 13px; text-transform: uppercase; display: flex; justify-content: space-between; align-items: center; }
        .section-content { padding: 15px; }
        
        .row { display: flex; gap: 20px; margin-bottom: 12px; }
        .col { flex: 1; }
        .field { margin-bottom: 8px; }
        .label { font-weight: 700; color: #003366; font-size: 11px; text-transform: uppercase; margin-bottom: 2px; }
        .value { border: 1px solid #e2e8f0; background: #f8fafc; padding: 6px 10px; min-height: 18px; font-size: 14px; color: #2d3748; border-radius: 4px; }
        
        .passport-area { width: 150px; height: 180px; border: 2px dashed #cbd5e0; border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #f7fafc; }
        .passport-area img { width: 100%; height: 100%; object-fit: cover; }
        
        .footer { text-align: center; margin-top: 30px; font-size: 13px; color: white; background: #003366; padding: 15px; border-radius: 0 0 12px 12px; margin: 30px -40px -40px -40px; }
        .print-btn { position: fixed; top: 20px; right: 20px; background: #003366; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 700; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 100; font-family: 'Outfit', sans-serif; transition: all 0.2s; }
        .print-btn:hover { background: #002244; transform: translateY(-2px); }
        
        @media print {
            .print-btn { display: none; }
            body { padding: 0; background: white; }
            .form-container { box-shadow: none; border: none; padding: 20px; width: 100%; max-width: 100%; }
        }

        .batch-tag { background: #003366; color: white; padding: 10px 20px; border-radius: 4px; font-weight: 800; font-size: 18px; display: inline-block; margin-top: 5px; }
    </style>
</head>
<body>
    <button class="print-btn" onclick="window.print()">Download / Print as PDF</button>

    <div class="form-container">
        <div class="header">
            <img src="logo.PNG" alt="GFA Logo" style="width: 100px; height: auto; margin-bottom: 10px;">
            <h1>ASLIN FASHION SCHOOL</h1>
            <div class="sub-title">ADMISSION APPLICATION FORM</div>
            <div style="margin-top: 15px; font-size: 13px; font-weight: 600;">
                Serial No: <span style="color: #c53030;">${escapeHtml(record.serial || "")}</span> &nbsp;&nbsp;|&nbsp;&nbsp; 
                Date: ${new Date(submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
        </div>

        <div class="section">
            <div class="section-header">
                <span>SECTION A: APPLICANT PARTICULARS</span>
                <span style="background: #FFD700; color: #003366; padding: 2px 10px; border-radius: 4px; font-size: 11px;">BRANCH: ${getVal('preferred_branch')}</span>
            </div>
            <div class="section-content">
                <div class="row">
                    <div class="col" style="flex: 3;">
                        <div class="field">
                            <div class="label">Surname</div>
                            <div class="value">${getVal('surname')}</div>
                        </div>
                        <div class="field">
                            <div class="label">First Name & Other Names</div>
                            <div class="value">${getVal('firstname')} ${getVal('othernames')}</div>
                        </div>
                        <div class="row">
                            <div class="col">
                                <div class="label">Gender</div>
                                <div class="value">${getVal('gender')}</div>
                            </div>
                            <div class="col">
                                <div class="label">Date of Birth</div>
                                <div class="value">${getVal('dob')}</div>
                            </div>
                        </div>
                        <div class="field">
                            <div class="label">Place of Birth / Hometown</div>
                            <div class="value">${getVal('pob')} / ${getVal('hometown')}</div>
                        </div>
                    </div>
                    <div class="col" style="flex: 1; display: flex; flex-direction: column; align-items: center;">
                        <div class="label" style="margin-bottom: 5px;">PASSPORT PHOTO</div>
                        <div class="passport-area">
                            ${passportDataUrl ? `<img src="${passportDataUrl}" />` : '<span style="color:#a0aec0;font-size:12px;">No Image</span>'}
                        </div>
                    </div>
                </div>
                <div class="row">
                    <div class="col">
                        <div class="label">Religious Denomination</div>
                        <div class="value">${getVal('religion')}</div>
                    </div>
                    <div class="col">
                        <div class="label">Residential Status</div>
                        <div class="value">${getVal('residential')}</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-header">SECTION B: CONTACT & BACKGROUND INFORMATION</div>
            <div class="section-content">
                <div class="field">
                    <div class="label">Residential Address (Town, Street, Contact)</div>
                    <div class="value" style="min-height: 40px;">${getVal('contact_address')}</div>
                </div>
                <div class="row">
                    <div class="col">
                        <div class="label">Living Situation</div>
                        <div class="value">${getVal('living_situation')}</div>
                    </div>
                    <div class="col">
                        <div class="label">How did you hear about GFA?</div>
                        <div class="value">${getVal('marketing')}</div>
                    </div>
                </div>
                <div class="field">
                    <div class="label">First time in a fashion center?</div>
                    <div class="value">${getVal('first_time')} ${dataObj.first_time === 'No' ? ` (Previous: ${getVal('previous_school')})` : ''}</div>
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-header">SECTION C: FAMILY INFORMATION</div>
            <div class="section-content">
                <div class="row">
                    <div class="col">
                        <div class="field">
                            <div class="label">Father's Name & Occupation</div>
                            <div class="value">${getVal('father_name')} â€” ${getVal('father_job')}</div>
                        </div>
                        <div class="field">
                            <div class="label">Father's Phone Number</div>
                            <div class="value">${getVal('father_phone')}</div>
                        </div>
                    </div>
                    <div class="col">
                        <div class="field">
                            <div class="label">Mother's Name & Occupation</div>
                            <div class="value">${getVal('mother_name')} â€” ${getVal('mother_job')}</div>
                        </div>
                        <div class="field">
                            <div class="label">Mother's Phone Number</div>
                            <div class="value">${getVal('mother_phone')}</div>
                        </div>
                    </div>
                </div>
                <div style="margin-top: 10px; padding: 12px; background: #fffdf2; border: 1px dashed #e9c46a; border-radius: 6px;">
                    <div class="label" style="color: #856404;">Emergency Contact (Different from parents)</div>
                    <div class="row" style="margin-bottom: 0;">
                        <div class="col">
                            <div class="label">Name</div>
                            <div class="value">${getVal('emergency_name')}</div>
                        </div>
                        <div class="col">
                            <div class="label">Phone Number</div>
                            <div class="value">${getVal('emergency_phone')}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-header">SECTION D: MEDICAL INFORMATION</div>
            <div class="section-content">
                <div class="row">
                    <div class="col">
                        <div class="label">Family Doctor & Contact</div>
                        <div class="value">${getVal('doctor_name')} (${getVal('doctor_phone')})</div>
                    </div>
                    <div class="col">
                        <div class="label">Asthma / Inhaler Status</div>
                        <div class="value">${getVal('asthma')}</div>
                    </div>
                </div>
                <div class="row">
                    <div class="col">
                        <div class="label">NHIS Card Active & Number</div>
                        <div class="value">${getVal('nhis')} | ${getVal('nhis_number')}</div>
                    </div>
                    <div class="col">
                        <div class="label">Other Special Needs</div>
                        <div class="value">${getVal('other_needs')}</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="row" style="margin-top: 20px;">
            <div class="col" style="flex: 1.5;">
                <div class="label">Agreements & Policies</div>
                <div style="font-size: 12px; color: #4a5568; border: 1px solid #e2e8f0; padding: 10px; border-radius: 6px;">
                    (&#10003;) Agreed to the Code of Behavior and Financial Responsibilities.<br>
                    (&#10003;) Understands that payments made are non-refundable.
                </div>
            </div>
            <div class="col" style="text-align: center;">
                <div class="label">Selected Admission Batch</div>
                <div class="batch-tag">${getVal('admission_batch')}</div>
            </div>
        </div>

        <div class="footer">
            <div style="font-weight: 700; font-size: 16px; margin-bottom: 5px;">CONTACT US ON</div>
            <div>+233 24 426 4872 / +233 54 344 3983</div>
        </div>
    </div>

    <script type="application/json" id="formDataJson">${escapeHtml(JSON.stringify({ serial: record.serial, submittedAt, formData: dataObj }, null, 2))}</script>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GFA_Admission_${safeSerial}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// Open Form State (New or Read-Only)
function openForm(record) {
    currentActiveRecord = record;
    const gateSection = document.getElementById('gate-section');
    const formSection = document.getElementById('form-section');
    const currentSerialInput = document.getElementById('current-serial');
    const hiddenPin = document.getElementById('hidden-pin');
    const readOnlyBanner = document.getElementById('readonly-banner');
    const submitWrapper = document.getElementById('submit-wrapper');
    const readOnlyMsg = document.getElementById('read-only-msg');
    const form = document.getElementById('admission-form');
    const prevSchoolDiv = document.getElementById('previous-school-div');
    const downloadBtn = document.getElementById('btn-download');

    if (gateSection) gateSection.classList.add('hidden');
    if (formSection) formSection.classList.remove('hidden');

    if (currentSerialInput) currentSerialInput.value = record.serial || "";
    if (hiddenPin) hiddenPin.value = record.pin || "";

    if (record.used) {
        readOnlyBanner.classList.remove('hidden');
        submitWrapper.classList.add('hidden');
        readOnlyMsg.classList.remove('hidden');
        form.classList.add('read-only');

        const data = record.formData;
        if (data && typeof data === "object") {
            for (const key in data) {
                const elems = form.elements[key];
                if (!elems) continue;
                if (elems.type === 'file') continue;

                if (elems.length !== undefined && elems.type !== 'select-one') {
                    Array.from(elems).forEach(el => {
                        if (el.value === data[key]) el.checked = true;
                    });
                } else {
                    if (elems.type === 'checkbox') {
                        elems.checked = (data[key] === true || data[key] === "on");
                    } else {
                        elems.value = data[key];
                    }
                }
            }

            if (data['first_time'] === "No") {
                prevSchoolDiv.classList.remove('hidden');
            }
        }

        Array.from(form.elements).forEach(el => {
            if (el.id === 'btn-submit' || el.id === 'current-serial') return;
            if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'file' || el.tagName === 'SELECT') {
                el.disabled = true;
            } else {
                el.readOnly = true;
                el.disabled = false;
            }
        });

        const previewText = document.getElementById('preview-text');
        if (previewText) {
            previewText.innerText = "Submitted\nSafely";
            previewText.style.color = "#137333";
        }
        const pUpload = document.getElementById('passport-upload');
        if (pUpload) {
            pUpload.type = "text";
            pUpload.value = "Image stored securely.";
            pUpload.style.border = "none";
            pUpload.style.background = "transparent";
            pUpload.disabled = true;
        }

        if (downloadBtn) {
            downloadBtn.classList.remove('hidden');
            downloadBtn.onclick = () => downloadFilledForm(record);
        }

        // Removed admissionBtnReadonly setup


    } else {
        readOnlyBanner.classList.add('hidden');
        submitWrapper.classList.remove('hidden');
        readOnlyMsg.classList.add('hidden');
        form.classList.remove('read-only');

        if (downloadBtn) {
            downloadBtn.classList.add('hidden');
            downloadBtn.onclick = null;
        }
    }
}

// ========================
// ADMISSION LETTER GENERATOR
// ========================

function getLogoDataUrl() {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = function() {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            } catch (e) {
                console.warn("Logo conversion failed:", e);
                resolve(null);
            }
        };
        img.onerror = function() {
            console.warn("Logo image failed to load.");
            resolve(null);
        };
        img.src = "logo.jpg";
    });
}

function getImageDataUrl(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = function() {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg'));
            } catch (e) {
                console.warn(src + " conversion failed:", e);
                resolve(null);
            }
        };
        img.onerror = function() {
            console.warn(src + " failed to load.");
            resolve(null);
        };
        img.src = src;
    });
}

function downloadAdmissionLetter() {
    // Get student name from form or stored data for reference only
    let studentData = {};
    if (currentActiveRecord && currentActiveRecord.formData) {
        studentData = currentActiveRecord.formData;
    } else {
        const formEl = document.getElementById('admission-form');
        if (formEl) {
            const fd = new FormData(formEl);
            for (const pair of fd.entries()) {
                const key = pair[0];
                const value = pair[1];
                studentData[key] = (value && typeof value === "object" && "name" in value) ? value.name : value;
            }
        }
    }

    const firstName = studentData.firstname || "Student";
    const surname = studentData.surname || "";
    const otherNames = studentData.othernames || "";
    const fullName = [surname.toUpperCase(), firstName, otherNames].filter(Boolean).join(" ");
    const safeName = fullName.replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, "_");
    const address = studentData.contact_address || "N/A";
    const phone = studentData.emergency_phone || studentData.father_phone || studentData.mother_phone || "N/A";

    // Extract serial and pin
    const serial = (currentActiveRecord && currentActiveRecord.serial) || studentData['current-serial'] || "N/A";
    const pin = (currentActiveRecord && currentActiveRecord.pin) || studentData['gate-pin'] || document.getElementById('hidden-pin')?.value || "N/A";
    const parts = serial.split('-');
    const serialSuffix = parts[parts.length - 1] || "000";

    // Dynamic reporting day based on batch
    let reportingDay = "Thursday, 18th June 2026";
    const batchVal = studentData.admission_batch || "";
    if (batchVal.includes("18th June 2026")) {
        reportingDay = "Thursday, 18th June 2026";
    } else if (batchVal.includes("20th July 2026")) {
        reportingDay = "Monday, 20th July 2026";
    } else if (batchVal.includes("18th August 2026")) {
        reportingDay = "Tuesday, 18th August 2026";
    } else if (batchVal.includes("12th January 2027")) {
        reportingDay = "Tuesday, 12th January 2027";
    } else if (batchVal) {
        reportingDay = batchVal;
    }

    // Format Date
    function getOrdinalSuffix(day) {
        if (day > 3 && day < 21) return 'th';
        switch (day % 10) {
            case 1:  return "st";
            case 2:  return "nd";
            case 3:  return "rd";
            default: return "th";
        }
    }
    const submissionDate = (currentActiveRecord && currentActiveRecord.submittedAt)
        ? new Date(currentActiveRecord.submittedAt)
        : new Date();
    const day = submissionDate.getDate();
    const month = submissionDate.toLocaleString('en-GB', { month: 'long' });
    const year = submissionDate.getFullYear();
    const dateStr = `${day}${getOrdinalSuffix(day)} ${month}, ${year}`;

    if (typeof html2pdf !== 'undefined') {
        console.log("Generating premium admission form for:", fullName);

        getLogoDataUrl().then(logoDataUrl => {
            const logoHtml = logoDataUrl
                ? `<img src="${logoDataUrl}" alt="Aslin Fashion School Logo" style="width:90px;height:auto;display:block;margin:0 auto 8px;">`
                : `<div style="width:80px;height:80px;margin:0 auto 8px;border-radius:50%;background:#003366;border:3px solid #FFD700;display:flex;align-items:center;justify-content:center;color:#FFD700;font-size:22px;font-weight:bold;">AFS</div>`;

            const logoHtmlWhite = logoDataUrl
                ? `<img src="${logoDataUrl}" alt="Logo" style="width:80px;height:auto;display:block;margin:0 auto 6px;filter:brightness(0) invert(1);">`
                : `<div style="width:70px;height:70px;margin:0 auto 6px;border-radius:50%;background:rgba(255,255,255,0.2);border:2px solid #FFD700;display:flex;align-items:center;justify-content:center;color:#FFD700;font-size:18px;font-weight:bold;">AFS</div>`;

            const passportSrc = studentData._passportDataUrl || null;
            const passportHtml = passportSrc
                ? `<img src="${passportSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:4px;" />`
                : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:11px;text-align:center;padding:8px;">No Photo</div>`;

            const container = document.createElement("div");
            container.style.position = "absolute";
            container.style.left = "-9999px";
            container.style.top = "-9999px";
            container.style.width = "760px";

            container.innerHTML = `
<div style="font-family:'Times New Roman',Times,serif;color:#1a202c;background:white;">

  <!-- PAGE 1: ADMISSION LETTER -->
  <div style="padding:40px 50px;font-size:14.5px;line-height:1.65;page-break-after:always;">

    <!-- Letterhead -->
    <div style="text-align:center;border-bottom:3px solid #003366;padding-bottom:16px;margin-bottom:24px;">
      ${logoHtml}
      <h1 style="color:#003366;margin:4px 0 2px;font-size:26px;text-transform:uppercase;font-weight:bold;letter-spacing:2px;font-family:Arial,sans-serif;">ASLIN FASHION SCHOOL</h1>
      <p style="margin:0;font-size:11.5px;color:#4a5568;font-weight:600;font-family:Arial,sans-serif;">Accra &amp; Kumasi Branches, Ghana &nbsp;|&nbsp; Tel: +233 24 426 4872 / +233 54 344 3983</p>
      <p style="margin:4px 0 0;font-size:11px;color:#718096;font-family:Arial,sans-serif;">Email: aslinfashionschoolonlineforms@gmail.com</p>
    </div>

    <!-- Ref / Date -->
    <div style="display:flex;justify-content:space-between;margin-bottom:22px;font-size:13.5px;">
      <div><strong>Our Ref:</strong> AFS/ADM/2026/${serialSuffix}<br><strong>Your Ref:</strong> .............................</div>
      <div style="text-align:right;"><strong>Date:</strong> ${dateStr}<br><strong>Branch:</strong> ${studentData.preferred_branch || 'Accra / Kumasi'}</div>
    </div>

    <!-- Addressee -->
    <div style="margin-bottom:22px;font-size:13.5px;background:#f0f4ff;border-left:5px solid #003366;padding:12px 16px;border-radius:0 6px 6px 0;">
      <strong>To:</strong><br>
      <span style="text-transform:uppercase;font-weight:bold;color:#003366;font-size:15px;font-family:Arial,sans-serif;">${fullName}</span><br>
      <span style="font-size:13px;color:#4a5568;">${address}</span><br>
      <span style="font-size:13px;">Tel: ${phone}</span>
    </div>

    <!-- Salutation & Title -->
    <p style="margin-bottom:16px;">Dear ${firstName},</p>
    <h3 style="text-align:center;color:#003366;text-transform:uppercase;border-top:1px solid #FFD700;border-bottom:3px double #FFD700;padding:8px 0;margin:18px 0;font-size:15px;font-weight:bold;letter-spacing:0.5px;font-family:Arial,sans-serif;">OFFER OF PROVISIONAL ADMISSION — 2025/2026 ACADEMIC SESSION</h3>

    <!-- Body -->
    <p style="text-align:justify;margin-bottom:14px;text-indent:30px;">A warm welcome to <strong>ASLIN FASHION SCHOOL</strong>! We are thrilled to inform you that you have been successfully selected to join our esteemed institution for the upcoming 2025/2026 academic year. Congratulations on this significant achievement.</p>
    <p style="text-align:justify;margin-bottom:14px;text-indent:30px;">Your academic session will officially commence on <strong>${reportingDay}</strong>. You are requested to report directly to the academy campus on this scheduled date, fully prepared to embark on an incredible, creative journey into the professional world of fashion, design, and garment construction.</p>
    <p style="text-align:justify;margin-bottom:14px;">As part of your entry requirements, you are expected to fulfill the primary institutional financial obligations prior to the start of instruction:</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:13.5px;">
      <thead>
        <tr style="background-color:#003366;color:white;">
          <th style="padding:8px 12px;text-align:left;border:1px solid #cbd5e0;">Fee Description</th>
          <th style="padding:8px 12px;text-align:right;border:1px solid #cbd5e0;width:160px;">Amount (GH&#8373;)</th>
        </tr>
      </thead>
      <tbody>
        <tr style="background:#f8fafc;">
          <td style="padding:8px 12px;border:1px solid #e2e8f0;">School Fees (Tuition)</td>
          <td style="padding:8px 12px;text-align:right;border:1px solid #e2e8f0;font-weight:bold;">2,800.00</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;border:1px solid #e2e8f0;">Hostel Accommodation Fee</td>
          <td style="padding:8px 12px;text-align:right;border:1px solid #e2e8f0;font-weight:bold;">1,300.00</td>
        </tr>
        <tr style="font-weight:bold;background:#003366;color:white;">
          <td style="padding:9px 12px;border:1px solid #003366;text-transform:uppercase;">Total Core Fees</td>
          <td style="padding:9px 12px;text-align:right;border:1px solid #003366;font-size:15px;">4,100.00</td>
        </tr>
      </tbody>
    </table>

    <div style="background:#fffdf0;border:1.5px dashed #003366;padding:11px 16px;margin-bottom:18px;border-radius:6px;font-size:13px;line-height:1.75;">
      <strong style="color:#003366;text-transform:uppercase;font-size:11.5px;display:block;margin-bottom:4px;font-family:Arial,sans-serif;">Official Payment Channels:</strong>
      &bull; <strong>Bank:</strong> Account No. 1441001510975 | Account Name: ASLIN FASHION SCHOOL<br>
      &bull; <strong>MoMo:</strong> 0558598393 | Name: ASLIN FASHION SCHOOL<br>
      &bull; <strong>Cash:</strong> Directly at the school accounts office on your reporting day.
    </div>

    <p style="text-align:justify;margin-bottom:14px;">Please bring your <strong>Hand sewing machine</strong>, a <strong>Brand new industrial steam electric iron</strong>, and a valid national health <strong>Insurance card</strong> on your arrival day.</p>
    <p style="text-align:justify;margin-bottom:32px;">We look forward to nurturing your creativity, skills, and passion for fashion design. We look forward to seeing you soon.</p>

    <!-- Signature -->
    <div style="display:flex;justify-content:space-between;align-items:flex-end;font-size:13.5px;">
      <div>
        <br><br>
        <div style="width:180px;border-bottom:1px solid #000;margin-bottom:5px;"></div>
        <strong>The Admission Team</strong><br>ASLIN FASHION SCHOOL
      </div>
      <div style="text-align:right;">
        <strong>Provisional Status:</strong><br>
        <span style="color:#16a34a;font-weight:bold;font-size:17px;font-family:Arial,sans-serif;">&#10003; APPROVED</span>
      </div>
    </div>
  </div>

  <!-- PAGE 2: STUDENT ADMISSION FORM / CREDENTIALS CARD -->
  <div style="padding:36px 44px;background:#f0f4f8;min-height:800px;">

    <!-- Card Header -->
    <div style="background:linear-gradient(135deg,#003366 0%,#00509e 100%);color:white;padding:26px 30px 22px;border-radius:14px 14px 0 0;text-align:center;">
      ${logoHtmlWhite}
      <h1 style="margin:6px 0 3px;font-size:24px;text-transform:uppercase;letter-spacing:2px;font-family:Arial,sans-serif;font-weight:900;">ASLIN FASHION SCHOOL</h1>
      <p style="margin:0 0 10px;font-size:11px;opacity:0.85;font-family:Arial,sans-serif;">Accra &amp; Kumasi Branches, Ghana</p>
      <div style="display:inline-block;background:#FFD700;color:#003366;padding:5px 22px;border-radius:20px;font-weight:800;font-size:13px;letter-spacing:1.5px;font-family:Arial,sans-serif;">STUDENT ADMISSION FORM</div>
    </div>

    <!-- Card Body -->
    <div style="background:white;border:2px solid #003366;border-top:none;border-radius:0 0 14px 14px;padding:28px 30px;box-shadow:0 6px 24px rgba(0,51,102,0.12);">

      <!-- Photo + Credentials Row -->
      <div style="display:flex;gap:22px;margin-bottom:22px;align-items:flex-start;">

        <!-- Passport Photo -->
        <div style="flex-shrink:0;text-align:center;">
          <div style="width:115px;height:140px;border:3px solid #003366;border-radius:8px;overflow:hidden;background:#f0f4ff;">
            ${passportHtml}
          </div>
          <div style="font-size:9.5px;color:#6b7280;margin-top:4px;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:0.5px;">Passport Photo</div>
        </div>

        <!-- Credentials Box -->
        <div style="flex:1;">
          <div style="background:linear-gradient(135deg,#f0f7ff,#e4effe);border:2px solid #003366;border-radius:10px;padding:18px 20px;">
            <div style="font-size:9.5px;font-family:Arial,sans-serif;text-transform:uppercase;color:#6b7280;font-weight:700;letter-spacing:1.5px;margin-bottom:12px;">Applicant Credentials</div>

            <div style="margin-bottom:14px;">
              <div style="font-size:9px;color:#6b7280;font-family:Arial,sans-serif;text-transform:uppercase;font-weight:700;margin-bottom:2px;">Full Name</div>
              <div style="font-size:17px;font-weight:900;color:#003366;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:0.5px;">${fullName}</div>
            </div>

            <div style="display:flex;gap:14px;margin-top:14px;">
              <div style="flex:1;background:#003366;color:white;border-radius:10px;padding:13px 14px;text-align:center;">
                <div style="font-size:8.5px;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:1.5px;opacity:0.75;margin-bottom:5px;">Serial Number</div>
                <div style="font-size:14px;font-weight:900;font-family:'Courier New',monospace;letter-spacing:2px;">${serial}</div>
              </div>
              <div style="flex:1;background:#FFD700;color:#003366;border-radius:10px;padding:13px 14px;text-align:center;border:2px solid #003366;">
                <div style="font-size:8.5px;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:1.5px;opacity:0.7;margin-bottom:5px;">Access PIN</div>
                <div style="font-size:14px;font-weight:900;font-family:'Courier New',monospace;letter-spacing:2px;">${pin}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Dashed cut line -->
      <div style="position:relative;text-align:center;margin:18px 0;">
        <div style="border-top:2px dashed #cbd5e0;position:absolute;top:50%;left:0;right:0;"></div>
        <span style="background:white;padding:0 14px;position:relative;color:#9ca3af;font-size:12px;font-family:Arial,sans-serif;">&#9988; Cut and keep this card</span>
      </div>

      <!-- Details Grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:12.5px;font-family:Arial,sans-serif;margin-bottom:20px;">
        <div>
          <div style="color:#6b7280;font-size:9.5px;text-transform:uppercase;font-weight:700;margin-bottom:2px;">Gender</div>
          <div style="border-bottom:1.5px solid #e2e8f0;padding-bottom:5px;font-weight:600;color:#1a202c;">${studentData.gender || 'N/A'}</div>
        </div>
        <div>
          <div style="color:#6b7280;font-size:9.5px;text-transform:uppercase;font-weight:700;margin-bottom:2px;">Date of Birth</div>
          <div style="border-bottom:1.5px solid #e2e8f0;padding-bottom:5px;font-weight:600;color:#1a202c;">${studentData.dob || 'N/A'}</div>
        </div>
        <div>
          <div style="color:#6b7280;font-size:9.5px;text-transform:uppercase;font-weight:700;margin-bottom:2px;">Preferred Branch</div>
          <div style="border-bottom:1.5px solid #e2e8f0;padding-bottom:5px;font-weight:600;color:#1a202c;">${studentData.preferred_branch || 'N/A'}</div>
        </div>
        <div>
          <div style="color:#6b7280;font-size:9.5px;text-transform:uppercase;font-weight:700;margin-bottom:2px;">Admission Batch</div>
          <div style="border-bottom:1.5px solid #e2e8f0;padding-bottom:5px;font-weight:600;color:#003366;">${studentData.admission_batch || 'N/A'}</div>
        </div>
        <div>
          <div style="color:#6b7280;font-size:9.5px;text-transform:uppercase;font-weight:700;margin-bottom:2px;">Residential Status</div>
          <div style="border-bottom:1.5px solid #e2e8f0;padding-bottom:5px;font-weight:600;color:#1a202c;">${studentData.residential || 'N/A'}</div>
        </div>
        <div>
          <div style="color:#6b7280;font-size:9.5px;text-transform:uppercase;font-weight:700;margin-bottom:2px;">Issue Date</div>
          <div style="border-bottom:1.5px solid #e2e8f0;padding-bottom:5px;font-weight:600;color:#1a202c;">${dateStr}</div>
        </div>
      </div>

      <!-- Important notice -->
      <div style="background:#fff8e1;border:1.5px solid #ffc107;border-radius:8px;padding:12px 16px;font-size:12px;font-family:Arial,sans-serif;color:#856404;">
        <strong>&#9888; IMPORTANT:</strong> Keep your <strong>Serial Number</strong> and <strong>PIN</strong> strictly confidential. These are unique to you and cannot be reused once submitted. <strong>Present this form on your reporting day.</strong>
      </div>

      <!-- Footer -->
      <div style="background:#003366;color:white;text-align:center;padding:12px 16px;border-radius:8px;margin-top:18px;font-size:11.5px;font-family:Arial,sans-serif;letter-spacing:0.5px;">
        <strong>ASLIN FASHION SCHOOL</strong> &nbsp;|&nbsp; +233 24 426 4872 / +233 54 344 3983 &nbsp;|&nbsp; aslinfashionschoolonlineforms@gmail.com
      </div>
    </div>
  </div>

</div>`;

            document.body.appendChild(container);

            const opt = {
                margin:       [8, 8, 8, 8],
                filename:     `Aslin_Admission_Form_${safeName}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2, useCORS: true, letterRendering: true, allowTaint: true },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            html2pdf().set(opt).from(container).save().then(() => {
                document.body.removeChild(container);
                console.log("Admission form PDF generated for:", fullName);
            }).catch(err => {
                console.error("PDF generation failed:", err);
                document.body.removeChild(container);
                alert("Could not generate PDF. Please try printing the page instead.");
            });
        });

    } else {
        console.warn("html2pdf library not detected. Falling back to generic PDF.");
        try {
            const pdfPath = "General_Fashion_Academy_Letter_Single_Sheet.pdf";
            const a = document.createElement("a");
            a.href = pdfPath;
            a.download = `Aslin_Admission_Form_${safeName}.pdf`;
            a.target = "_blank";
            document.body.appendChild(a);
            a.click();
            a.remove();
            console.log("Admission letter fallback download triggered for:", fullName);
        } catch (error) {
            console.error("Error downloading admission letter:", error);
            alert("Error: Could not download the admission form. Please contact support.");
        }
    }
}
