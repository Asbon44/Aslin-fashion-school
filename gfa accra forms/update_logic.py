import sys

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

login_orig = '''    // Handle Login
    loginBtn.addEventListener('click', () => {
        const serial = inputSerial.value.trim().toUpperCase();
        const pin = inputPin.value.trim();

        if (!serial || !pin) {
            loginError.innerText = "Please enter both Serial and PIN.";
            loginError.style.display = 'block';
            return;
        }

        let db = JSON.parse(localStorage.getItem('gfa_database'));
        let record = db.find(r => r.serial === serial && r.pin === pin);

        if (record) {
            loginError.style.display = 'none';
            openForm(record);
        } else {
            loginError.innerText = "Invalid Serial Number or PIN.";
            loginError.style.display = 'block';
        }
    });'''

login_new = '''    // Handle Login
    loginBtn.addEventListener('click', async () => {
        const serial = inputSerial.value.trim().toUpperCase();
        const pin = inputPin.value.trim();

        if (!serial || !pin) {
            loginError.innerText = "Please enter both Serial and PIN.";
            loginError.style.display = 'block';
            return;
        }

        loginBtn.innerText = "Verifying securely...";
        loginBtn.disabled = true;

        let db = JSON.parse(localStorage.getItem('gfa_database'));
        let record = db.find(r => r.serial === serial && r.pin === pin);

        if (record) {
            loginError.style.display = 'none';
            
            try {
                // Check Firebase for this serial's submission
                const docRef = doc(firestoreDb, "submissions", serial);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists()) {
                    record.used = true;
                    record.formData = docSnap.data();
                } else {
                    record.used = false;
                    record.formData = null;
                }
                openForm(record);
            } catch (err) {
                console.error("Firebase error: ", err);
                loginError.innerText = "Error securely connecting to database.";
                loginError.style.display = 'block';
            }
        } else {
            loginError.innerText = "Invalid Serial Number or PIN.";
            loginError.style.display = 'block';
        }

        loginBtn.innerText = "Access Form";
        loginBtn.disabled = false;
    });'''

submit_orig = '''        // 3. Mark in DB as Used
        let db = JSON.parse(localStorage.getItem('gfa_database'));
        let index = db.findIndex(r => r.serial === dataObj['current-serial']);
        if (index > -1) {
            db[index].used = true;
            db[index].formData = dataObj;
            localStorage.setItem('gfa_database', JSON.stringify(db));
        }

        // 4. Send background email via standard FormSubmit POST'''

submit_new = '''        // 3. Mark in DB as Used
        let db = JSON.parse(localStorage.getItem('gfa_database'));
        let index = db.findIndex(r => r.serial === dataObj['current-serial']);
        if (index > -1) {
            db[index].used = true;
            db[index].formData = dataObj;
            localStorage.setItem('gfa_database', JSON.stringify(db));
            
            // Save to Firebase securely
            const docRef = doc(firestoreDb, "submissions", dataObj['current-serial']);
            setDoc(docRef, dataObj).catch(err => console.error("Error saving to Firebase: ", err));
        }

        // 4. Send background email via standard FormSubmit POST'''

if login_orig not in content:
    print("Could not find login logic!")
    sys.exit(1)

if submit_orig not in content:
    print("Could not find submit logic!")
    sys.exit(1)

content = content.replace(login_orig, login_new)
content = content.replace(submit_orig, submit_new)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully replaced login and submit logic in app.js")
