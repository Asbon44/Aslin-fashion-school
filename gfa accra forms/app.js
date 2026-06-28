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
    const downloadBtn = document.getElementById('btn-download');
    const btnSubmit = document.getElementById('btn-submit');

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
                let userRecord = GFA_DB.find(u => {
                    const dbSerial = (u.serial || "").toString().trim().toUpperCase().replace(/\s+/g, '');
                    const dbPin = (u.pin || "").toString().trim().replace(/\s+/g, '');
                    return dbSerial === serial && dbPin === pin;
                });

                if (userRecord) {
                    if (db) {
                        try {
                            const snapshot = await db.ref('accra_forms').orderByChild('serial').equalTo(serial).once('value');
                            if (snapshot.exists()) {
                                const submissions = snapshot.val();
                                const submissionId = Object.keys(submissions)[0];
                                const cloudData = submissions[submissionId];
                                
                                userRecord.used = true;
                                userRecord.formData = cloudData;
                                userRecord.submittedAt = cloudData.submittedAt || new Date().toISOString();
                            }
                        } catch (syncErr) {
                            console.warn("Cloud sync failed, using local data:", syncErr);
                        }
                    }

                    loginError.style.display = 'none';
                    openForm(userRecord);
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

    // Submit Button Handler
    let isSubmitting = false;
    if (btnSubmit) {
        btnSubmit.addEventListener('click', () => {
            if (isSubmitting) return;
            if (!form.reportValidity()) return;

            isSubmitting = true;
            btnSubmit.innerText = "Processing...";
            btnSubmit.style.pointerEvents = "none";
            btnSubmit.style.opacity = "0.7";

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

            let index = GFA_DB.findIndex(r => r.serial === serial);

            try {
                if (index > -1 && GFA_DB[index].used === true) {
                    alert("Already submitted on this device.");
                    openForm(GFA_DB[index]);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    btnSubmit.innerText = "Submit Application";
                    btnSubmit.style.pointerEvents = "auto";
                    btnSubmit.style.opacity = "1";
                    isSubmitting = false;
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
            } catch (error) {
                console.warn("Local processing warning:", error);
            }

            // Prepare email content
            let emailBody = `==================================================\n     GFA ADMISSION APPLICATION - OFFICIAL REPORT\n==================================================\n\n`;
            emailBody += `SERIAL NUMBER    : ${serial}\n`;
            emailBody += `PREFERRED BRANCH : ${dataObj.preferred_branch || 'N/A'}\n`;
            emailBody += `ADMISSION BATCH  : ${dataObj.admission_batch || 'N/A'}\n`;
            emailBody += `SUBMISSION DATE  : ${new Date().toLocaleString()}\n\n`;
            emailBody += `FULL NAME        : ${dataObj.surname || ''}, ${dataObj.firstname || ''} ${dataObj.othernames || ''}\n`;
            emailBody += `==================================================\n             END OF APPLICATION REPORT\n==================================================\n`;

            const subject = `GFA Application: ${dataObj.admission_batch || 'Batch'} - ${dataObj.firstname || 'Applicant'} ${dataObj.surname || ''} (${serial})`;
            const fsSubject = document.getElementById('fs-subject');
            if (fsSubject) fsSubject.value = subject;
            const fsDetails = document.getElementById('fs-details');
            if (fsDetails) fsDetails.value = emailBody;

            const submissionRef = db.ref('accra_forms').push();
            dataObj.id = submissionRef.key;
            dataObj.submittedAt = new Date().toISOString();
            dataObj.serial = serial;
            
            if (db) {
                submissionRef.set(dataObj).then(() => {
                    const formDataEmail = new FormData(form);
                    fetch(form.action, { method: "POST", body: formDataEmail }).catch(e => console.warn("Email service error:", e));

                    if (currentActiveRecord) {
                        currentActiveRecord.used = true;
                        currentActiveRecord.formData = dataObj;
                        currentActiveRecord.submittedAt = dataObj.submittedAt;
                    } else {
                        currentActiveRecord = { serial, pin, used: true, formData: dataObj, submittedAt: dataObj.submittedAt };
                    }

                    formSection.classList.add('hidden');
                    document.getElementById('success-section').classList.remove('hidden');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    downloadAdmissionLetter();
                }).catch(err => {
                    console.error('Firebase error:', err);
                    alert("Error saving application. Check internet and try again.");
                    isSubmitting = false;
                    btnSubmit.innerText = "Submit Application";
                    btnSubmit.style.pointerEvents = "auto";
                    btnSubmit.style.opacity = "1";
                });
            } else {
                alert("Database connection is currently unavailable. Please try again in a few minutes.");
                isSubmitting = false;
                btnSubmit.innerText = "Submit Application";
                btnSubmit.style.pointerEvents = "auto";
                btnSubmit.style.opacity = "1";
            }
        });
    } else {
        console.error("Critical Error: Submit button (btn-submit) not found!");
    }

    // Download Button Handler
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            if (currentActiveRecord) downloadFilledForm(currentActiveRecord);
        });
    }

    // Form Prevention
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            return false;
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

        const admissionBtnReadonly = document.getElementById('btn-download-admission-readonly');
        if (admissionBtnReadonly) {
            admissionBtnReadonly.classList.remove('hidden');
            admissionBtnReadonly.onclick = () => downloadAdmissionLetter();
        }


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
    const fullName = [firstName, otherNames, surname].filter(Boolean).join(" ");
    const safeName = fullName.replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, "_");
    const address = studentData.contact_address || "N/A";
    const phone = studentData.emergency_phone || studentData.father_phone || studentData.mother_phone || "N/A";
    
    // Extract serial suffix
    const serial = (currentActiveRecord && currentActiveRecord.serial) || studentData['current-serial'] || "GFA-25-084";
    const parts = serial.split('-');
    const serialSuffix = parts[parts.length - 1] || "084";

    // Dynamic reporting day based on batch
    let reportingDay = "Thursday, 18th June 2026"; // default fallback
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

    // check if html2pdf is available
    if (typeof html2pdf !== 'undefined') {
        console.log("Generating dynamic PDF admission letter for:", fullName);
        
        // Create an offline-friendly HTML container
        const container = document.createElement("div");
        container.style.position = "absolute";
        container.style.left = "-9999px";
        container.style.top = "-9999px";
        container.style.width = "750px"; // A4 proportion width
        
        container.innerHTML = `
            <div style="font-family: 'Times New Roman', Times, serif; color: #1a202c; line-height: 1.6; padding: 40px 50px; font-size: 15px; background: white;">
                <!-- Header/Letterhead -->
                <div style="text-align: center; border-bottom: 2px solid #003366; padding-bottom: 15px; margin-bottom: 25px;">
                    <div style="width: 80px; height: 80px; margin: 0 auto 12px; border-radius: 50%; background: #003366; border: 3px solid #FFD700; display: flex; align-items: center; justify-content: center; color: #FFD700; font-family: 'Times New Roman', Times, serif; font-weight: bold; font-size: 26px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">GFA</div>
                    <h1 style="color: #003366; margin: 0; font-size: 26px; text-transform: uppercase; font-family: 'Times New Roman', Times, serif; font-weight: bold; letter-spacing: 1px;">ASLIN FASHION SCHOOL</h1>
                    <p style="margin: 5px 0 0; font-size: 12px; color: #4a5568; font-weight: bold;">Accra & Kumasi Branches, Ghana | Tel: +233 24 426 4872 / +233 54 344 3983</p>
                </div>
                
                <!-- Ref and Date Block -->
                <div style="display: flex; justify-content: space-between; margin-bottom: 25px; font-size: 14px;">
                    <div>
                        <strong>Our Ref:</strong> GFA/ADM/25/${serialSuffix}<br>
                        <strong>Your Ref:</strong> .............................
                    </div>
                    <div style="text-align: right;">
                        <strong>Date:</strong> ${dateStr}<br>
                        <strong>Location:</strong> Kwadaso - Kumasi / Accra
                    </div>
                </div>
                
                <!-- Addressed to -->
                <div style="margin-bottom: 25px; font-size: 14px; background: #f8fafc; border-left: 4px solid #003366; padding: 12px 16px;">
                    <strong>To:</strong><br>
                    <span style="text-transform: uppercase; font-weight: bold; color: #003366;">${fullName}</span><br>
                    <span>${address}</span><br>
                    <span>Tel: ${phone}</span>
                </div>
                
                <!-- Salutation -->
                <p style="margin-bottom: 20px; font-size: 15px;">Dear ${firstName},</p>
                
                <!-- Title -->
                <h3 style="text-align: center; color: #003366; text-transform: uppercase; border-bottom: 3px double #FFD700; padding-bottom: 8px; margin: 20px 0; font-size: 16px; font-weight: bold; letter-spacing: 0.5px;">OFFER OF PROVISIONAL ADMISSION — 2025/2026 ACADEMIC SESSION</h3>
                
                <!-- Letter Body -->
                <p style="text-align: justify; margin-bottom: 15px; text-indent: 30px;">A warm welcome to ASLIN FASHION SCHOOL! We are thrilled to inform you that you have been successfully selected to join our esteemed institution for the upcoming 2025/2026 academic year. Congratulations on this significant achievement.</p>
                
                <p style="text-align: justify; margin-bottom: 15px; text-indent: 30px;">We are excited to share that your academic session will officially commence on <strong>${reportingDay}</strong>. You are requested to report directly to the academy campus on this scheduled date, fully prepared to embark on an incredible, creative journey into the professional world of fashion, design, and garment construction.</p>
                
                <p style="text-align: justify; margin-bottom: 15px;">As part of your entry requirements, you are expected to fulfill the primary institutional financial obligations prior to the start of instruction. The breakdown of your core first-year fees is structured as follows:</p>
                
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
                    <thead>
                        <tr style="background-color: #003366; color: white;">
                            <th style="padding: 8px 12px; text-align: left; border: 1px solid #cbd5e0; font-weight: bold;">Fee Description</th>
                            <th style="padding: 8px 12px; text-align: right; border: 1px solid #cbd5e0; width: 150px; font-weight: bold;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="padding: 8px 12px; border: 1px solid #cbd5e0;">School Fees (Tuition)</td>
                            <td style="padding: 8px 12px; text-align: right; border: 1px solid #cbd5e0; font-weight: bold;">GH₵ 2,800.00</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 12px; border: 1px solid #cbd5e0;">Hostel Accommodation Fee</td>
                            <td style="padding: 8px 12px; text-align: right; border: 1px solid #cbd5e0; font-weight: bold;">GH₵ 1,300.00</td>
                        </tr>
                        <tr style="font-weight: bold; background-color: #f7fafc; color: #003366;">
                            <td style="padding: 8px 12px; border: 1px solid #cbd5e0; text-transform: uppercase;">Total Core Fees</td>
                            <td style="padding: 8px 12px; text-align: right; border: 1px solid #cbd5e0; font-size: 15px;">GH₵ 4,100.00</td>
                        </tr>
                    </tbody>
                </table>
                
                <p style="text-align: justify; margin-bottom: 15px;">In accordance with our academy financial standards, all core fees must be paid instantly before classes start. Alternatively, under our secondary approved condition, full payment of hostel accommodations and a minimum payment of 60% of the tuition fee must be finalized beforehand, with any remaining outstanding balance settled in fixed installments over a maximum period of three (3) months.</p>
                
                <div style="background-color: #f8fafc; border: 1.5px dashed #003366; padding: 12px 18px; margin-bottom: 20px; border-radius: 6px; font-size: 13px; line-height: 1.7;">
                    <strong style="color: #003366; text-transform: uppercase; font-size: 12px; display: block; margin-bottom: 4px;">Official Payment Channels:</strong>
                    • <strong>Bank Account Channel:</strong> Account Number 1441001510975 | Account Name: ASLIN FASHION SCHOOL<br>
                    • <strong>Mobile Money (MoMo) Channel:</strong> Mobile Number 0558598393 | Registered Name: ASLIN FASHION SCHOOL<br>
                    • <strong>Direct Cash:</strong> Cash payments can be processed directly with the school accounts office on your reporting day.
                </div>
                
                <p style="text-align: justify; margin-bottom: 20px;">Please remember to bring along your essential personal prospectus requirements on your arrival day, notably your <strong>Hand sewing machine</strong> (for self-use), a big-sized <strong>Brand new industrial steam electric iron</strong>, and a valid national health <strong>Insurance card</strong>.</p>
                
                <p style="text-align: justify; margin-bottom: 35px;">We look forward to nurturing your creativity, skills, and passion for the fashion design industry. We look forward to seeing you soon.</p>
                
                <!-- Signature block -->
                <div style="display: flex; justify-content: space-between; align-items: flex-end; font-size: 14px;">
                    <div>
                        <br><br>
                        <div style="width: 180px; border-bottom: 1px solid #000; margin-bottom: 6px;"></div>
                        <strong>The Admission Team</strong><br>
                        ASLIN FASHION SCHOOL
                    </div>
                    <div style="text-align: right;">
                        <strong>Provisional Status:</strong><br>
                        <span style="color: green; font-weight: bold; font-size: 16px;">APPROVED</span>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(container);
        
        const opt = {
            margin:       [10, 10, 10, 10],
            filename:     `GFA_Admission_Letter_${safeName}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        
        html2pdf().set(opt).from(container).save().then(() => {
            document.body.removeChild(container);
        }).catch(err => {
            console.error("PDF generation promise failed:", err);
            document.body.removeChild(container);
        });
        
    } else {
        console.warn("html2pdf library not detected. Falling back to generic PDF.");
        try {
            const pdfPath = "General_Fashion_Academy_Letter_Single_Sheet.pdf";
            const a = document.createElement("a");
            a.href = pdfPath;
            a.download = `GFA_Admission_Letter_${safeName}.pdf`;
            a.target = "_blank";
            document.body.appendChild(a);
            a.click();
            a.remove();
            console.log("Admission letter download triggered successfully for:", fullName);
        } catch (error) {
            console.error("Error downloading admission letter:", error);
            alert("Error: Could not download the admission letter. Please contact support.");
        }
    }
}
