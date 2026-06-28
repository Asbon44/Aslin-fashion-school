// Firebase Configuration
const firebaseConfig = {
    databaseURL: "https://gfa-admission-forms-default-rtdb.firebaseio.com/",
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// State
let currentUser = null;
let activeDraftId = null;
let currentViewedStudentId = null; // Added for student details view
// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Nav & Sections
    const sections = document.querySelectorAll('.page-section');
    const navItems = document.querySelectorAll('.nav-item');
    const navLinks = document.querySelector('.nav-links');
    const mobileMenuBtn = document.querySelector('.mobile-menu');

    // 2. Navigation Logic
    window.navigateTo = function (sectionId) {
        // Hide all sections
        sections.forEach(sec => sec.classList.remove('active'));

        // Show target section
        const targetSec = document.getElementById(sectionId);
        if (targetSec) {
            targetSec.classList.add('active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Toggle Footer Visibility
        const footer = document.getElementById('main-footer');
        const isPortal = sectionId.includes('portal') || sectionId.includes('admin') || sectionId.includes('student') || sectionId.includes('classrep');
        if (footer) {
            footer.style.display = isPortal ? 'none' : 'block';
        }

        // Update Nav Menu active state
        navItems.forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-target') === sectionId) {
                item.classList.add('active');
            }
        });

        // Trigger Data Loaders
        if (sectionId === 'admin-section') { loadAdminData(); if(window.initAccraAdmin) window.initAccraAdmin(); }
        if (sectionId === 'student-section') loadStudentData();
        if (sectionId === 'classrep-section') loadClassrepData();

        // Close Mobile Menu
        if (navLinks) navLinks.classList.remove('active');
    };

    // Nav Item Clicks
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.getAttribute('data-target');
            navigateTo(target);
        });
    });

    // Mobile Menu Toggle
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    // 3. Tab Logic (Generic for all tab systems)
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-btn')) {
            const container = e.target.closest('.login-container');
            const targetId = e.target.getAttribute('data-tab');

            // Switch tabs
            container.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');

            // Switch forms
            container.querySelectorAll('.login-form').forEach(form => form.classList.remove('active'));
            const targetForm = document.getElementById(targetId);
            if (targetForm) targetForm.classList.add('active');
        }

        // Portal Sidebar Nav
        const portalNavItem = e.target.closest('li[data-admin-tab], li[data-student-tab], li[data-classrep-tab]');
        if (portalNavItem) {
            const type = portalNavItem.hasAttribute('data-admin-tab') ? 'admin' : (portalNavItem.hasAttribute('data-student-tab') ? 'student' : 'classrep');
            const tabName = portalNavItem.getAttribute(`data-${type}-tab`);

            // UI Toggle
            portalNavItem.parentElement.querySelectorAll('li').forEach(li => li.classList.remove('active'));
            portalNavItem.classList.add('active');

            document.querySelectorAll(`.${type}-tab-content`).forEach(content => content.classList.remove('active'));
            const targetTab = document.getElementById(`${type}-${tabName}-tab`);
            if (targetTab) targetTab.classList.add('active');
        }
    });

    // 4. Lightbox Logic
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('gallery-item') || e.target.classList.contains('admission-row-img')) {
            const modal = document.getElementById('lightbox-modal');
            const img = document.getElementById('lightbox-img');
            if (modal && img) {
                img.src = e.target.src;
                modal.classList.add('active');
            }
        }
    });

    // 5. Auth Handlers
    // Admin Login
    const adminForm = document.getElementById('form-admin-login');
    if (adminForm) {
        adminForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const pwd = document.getElementById('admin-password').value.trim();
            const errorMsg = document.getElementById('admin-login-error');
            if (pwd === "Linda123") {
                currentUser = { type: 'admin' };
                errorMsg.textContent = '';
                navigateTo('admin-section');
            } else {
                errorMsg.textContent = "Invalid Credentials. Use password Linda123.";
            }
        });
    }

    // Student Login
    const studentLoginForm = document.getElementById('form-student-login');
    if (studentLoginForm) {
        studentLoginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const studentId = document.getElementById('student-id-login').value.trim().toUpperCase();
            const pwd = document.getElementById('student-password').value;
            const errorMsg = document.getElementById('student-login-error');

            try {
                const snapshot = await db.ref('students').once('value');
                const allStudents = snapshot.val();
                let found = null;
                for (let id in allStudents) {
                    if (allStudents[id].studentNumber === studentId) {
                        if (allStudents[id].password === pwd) {
                            found = { id, ...allStudents[id] };
                            break;
                        }
                    }
                }

                if (found) {
                    currentUser = { type: 'student', ...found };
                    navigateTo('student-section');
                } else {
                    errorMsg.textContent = "Invalid Student Number or password";
                }
            } catch (err) {
                errorMsg.textContent = "Error connecting to server";
            }
        });
    }

    // Student Register
    const studentRegForm = document.getElementById('form-student-register');
    if (studentRegForm) {
        studentRegForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const firstName = document.getElementById('reg-firstname').value;
            const surname = document.getElementById('reg-surname').value;
            const otherName = document.getElementById('reg-othername').value;
            const gender = document.getElementById('reg-gender').value;
            const level = document.getElementById('reg-level').value;
            const phone = document.getElementById('reg-phone').value;
            const email = document.getElementById('reg-email').value;
            const password = document.getElementById('reg-password').value;
            const passportFile = document.getElementById('reg-passport').files[0];
            const boardingChecked = document.querySelector('input[name="boarding-status"]:checked');
            const boardingStatus = boardingChecked ? boardingChecked.value : 'day';
            const errorMsg = document.getElementById('student-reg-error');

            try {
                const snap = await db.ref('students').orderByChild('email').equalTo(email).once('value');
                if (snap.exists()) {
                    errorMsg.textContent = "Email already in use";
                    return;
                }

                let base64 = "";
                if (passportFile) base64 = await fileToBase64(passportFile);

                // Sequential student numbers starting from 5140101000 incremented by 2
                const counterRef = db.ref('student_counter_v2');
                const result = await counterRef.transaction((currentCount) => {
                    return (currentCount || 0) + 1;
                });

                if (!result.committed) {
                    throw new Error("Could not generate student number");
                }

                const newCount = result.snapshot.val();
                const studentNumber = (5140101000 + (newCount - 1) * 2).toString();

                const studentData = {
                    name: `${firstName} ${surname}${otherName ? ' ' + otherName : ''}`,
                    firstName, surname, otherName, gender, level, email, phone, password,
                    studentNumber,
                    passportPic: base64,
                    boarding: boardingStatus === 'boarder',
                    course: 'Not Assigned',
                    attendance: 0,
                    registeredAt: new Date().toISOString()
                };

                const newRef = db.ref('students').push();
                await newRef.set(studentData);
                currentUser = { type: 'student', id: newRef.key, ...studentData };
                navigateTo('student-section');
                alert(`Welcome to GFA! Your Student Number is: ${studentNumber}. Please use this to login.`);
            } catch (err) {
                errorMsg.textContent = "Registration failed. Check connection.";
            }
        });
    }

    // Admin: Add Student
    const adminAddStudentForm = document.getElementById('form-add-student');
    if (adminAddStudentForm) {
        adminAddStudentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('add-st-name').value;
            const email = document.getElementById('add-st-email').value;
            const phone = document.getElementById('add-st-phone').value;
            const pwd = document.getElementById('add-st-password').value;
            const course = document.getElementById('add-st-course').value;
            const boarding = document.getElementById('add-st-boarding').checked;

            try {
                // Sequential student numbers
                const counterRef = db.ref('student_counter_v2');
                const result = await counterRef.transaction((currentCount) => {
                    return (currentCount || 0) + 1;
                });

                const newCount = result.snapshot.val();
                const studentNumber = (5140101000 + (newCount - 1) * 2).toString();

                const newRef = db.ref('students').push();
                await newRef.set({
                    name, email, phone, password: pwd, course, boarding,
                    studentNumber,
                    registeredAt: new Date().toISOString()
                });

                closeModal('add-student-modal');
                e.target.reset();
                alert(`Student added. ID: ${studentNumber}`);
            } catch (err) {
                alert('Failed to add student');
            }
        });
    }

    // Admin: Record Payment
    const adminAddPaymentForm = document.getElementById('form-add-payment');
    if (adminAddPaymentForm) {
        adminAddPaymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const studentId = document.getElementById('pay-st-id').value;
            const amount = document.getElementById('pay-amount').value;
            const method = document.getElementById('pay-method').value;
            const date = document.getElementById('pay-date').value;
            const type = document.getElementById('pay-type').value;

            // Save to Firebase
            const newRef = db.ref('payments').push();
            await newRef.set({ studentId, amount, method, date, type, createdAt: new Date().toISOString() });

            // Get student name for receipt
            const stName = document.querySelector(`#pay-st-id option[value="${studentId}"]`).textContent;

            // Populate Receipt
            document.getElementById('rec-no').textContent = `#GFA-${newRef.key.substring(1, 7).toUpperCase()}`;
            document.getElementById('rec-date').textContent = date;
            document.getElementById('rec-student').textContent = stName;
            document.getElementById('rec-method').textContent = method;
            document.getElementById('rec-amount').textContent = `GHC ${parseFloat(amount).toFixed(2)}`;

            // Setup Email to HQ Button
            const hqEmail = "generalfashionacademyaccra@gmail.com";
            document.getElementById('btn-send-hq').onclick = () => {
                const subject = `Payment Notification - ${stName}`;
                const body = `Official Receipt Details:%0A%0AStudent: ${stName}%0AAmount: GHC ${amount}%0ADate: ${date}%0AMethod: ${method}%0AReceipt No: #GFA-${newRef.key.substring(1, 7).toUpperCase()}%0A%0AGenerated via GFA Portal.`;
                window.location.href = `mailto:${hqEmail}?subject=${subject}&body=${body}`;
            };

            closeModal('add-payment-modal');
            e.target.reset();
            openModal('receipt-modal');
        });
    }

    // Admin: Post Announcement
    const adminAddAnnForm = document.getElementById('form-add-announcement');
    if (adminAddAnnForm) {
        adminAddAnnForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('ann-title').value;
            const message = document.getElementById('ann-message').value;

            const newRef = db.ref('announcements').push();
            await newRef.set({
                title,
                message,
                date: new Date().toLocaleDateString(),
                createdAt: new Date().toISOString()
            });

            e.target.reset();
            alert('Announcement posted to students!');
        });
    }

    // Student: Submit Complaint
    const studentCompForm = document.getElementById('form-student-complaint');
    if (studentCompForm) {
        studentCompForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const subject = document.getElementById('comp-subject').value;
            const message = document.getElementById('comp-message').value;

            if (!currentUser) return;

            const complaintData = {
                studentId: currentUser.id,
                studentName: currentUser.name,
                studentEmail: currentUser.email,
                subject,
                message,
                createdAt: new Date().toISOString()
            };

            try {
                // 1. Save to Firebase for admin to see
                await db.ref('complaints').push(complaintData);

                alert('Your complaint has been submitted successfully to the administration.');
                e.target.reset();
            } catch (err) {
                alert('Failed to submit complaint. Please check your connection.');
            }
        });
    }

    // Student: Submit Attachment
    const studentAttForm = document.getElementById('form-student-attachment');
    if (studentAttForm) {
        studentAttForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser) return;

            const shopName = document.getElementById('att-shop-name').value;
            const town = document.getElementById('att-town').value;
            const region = document.getElementById('att-region').value;
            const district = document.getElementById('att-district').value;
            const shopAddress = document.getElementById('att-shop-address').value;
            const ownerPhone = document.getElementById('att-owner-phone').value;

            const attachmentData = {
                studentId: currentUser.id,
                studentName: currentUser.name,
                studentEmail: currentUser.email,
                shopName,
                town,
                region,
                district,
                shopAddress,
                ownerPhone,
                createdAt: new Date().toISOString()
            };

            try {
                await db.ref('attachments').push(attachmentData);
                await db.ref('students/' + currentUser.id).update({ attachmentSubmitted: true });
                currentUser.attachmentSubmitted = true;
                document.getElementById('form-student-attachment').style.display = 'none';
                document.getElementById('attachment-success-msg').style.display = 'block';
            } catch (err) {
                alert('Failed to submit attachment details. Please check your connection.');
            }
        });
    }

    // Class Rep: Send Info to Admin
    const classrepAdminForm = document.getElementById('form-classrep-to-admin');
    if (classrepAdminForm) {
        classrepAdminForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!currentUser || currentUser.type !== 'classrep') return;

            const subject = document.getElementById('cr-admin-subject').value;
            const message = document.getElementById('cr-admin-message').value;

            const reportData = {
                level: currentUser.level,
                subject,
                message,
                createdAt: new Date().toISOString()
            };

            try {
                await db.ref('classrep_reports').push(reportData);
                alert('Information has been successfully sent to the Admin.');
                e.target.reset();
            } catch (err) {
                alert('Failed to send information. Please check your connection.');
            }
        });
    }

    loadGallery();
    startHeroSlideshow();
    startPortalSlideshow();
});

function startPortalSlideshow() {
    const studentBg = document.querySelector('.portal-bg-student');
    const adminBg = document.querySelector('.portal-bg-admin');

    const images = [
        "aslin gallery/IMG_8703.JPG",
        "aslin gallery/IMG_8708.JPG",
        "aslin gallery/IMG_8709.JPG",
        "aslin gallery/IMG_8710.JPG",
        "aslin gallery/IMG_8711.JPG"
    ];
    let currentIndex = 0;

    setInterval(() => {
        currentIndex = (currentIndex + 1) % images.length;
        const img = images[currentIndex];

        if (studentBg) {
            studentBg.style.background = `linear-gradient(rgba(10, 37, 64, 0.8), rgba(10, 37, 64, 0.8)), url('${img}') center top/cover no-repeat`;
        }
        if (adminBg) {
            adminBg.style.background = `linear-gradient(rgba(10, 37, 64, 0.8), rgba(10, 37, 64, 0.8)), url('${img}') center top/cover no-repeat`;
        }
    }, 7000);
}

function startHeroSlideshow() {
    const hero = document.querySelector('.hero');
    if (!hero) return;

    const images = [
        "gallery_1/IMG-20260429-WA0039.jpg",
        "gallery_1/IMG-20260429-WA0045.jpg",
        "gallery_1/IMG-20260429-WA0020.jpg",
        "gallery_1/IMG-20260429-WA0030.jpg",
        "gallery_1/IMG-20260429-WA0051.jpg"
    ];
    let currentIndex = 0;

    const changeBg = () => {
        hero.style.background = `linear-gradient(rgba(10, 37, 64, 0.7), rgba(10, 37, 64, 0.7)), url('${images[currentIndex]}') center top/cover no-repeat`;
        currentIndex = (currentIndex + 1) % images.length;
    };

    setInterval(changeBg, 7000);
}

// Helper Functions
function loadGallery() {
    const galleryContainer = document.getElementById('gallery-container');
    if (!galleryContainer) return;

    galleryContainer.innerHTML = '';
    for (let i = 3; i <= 28; i++) {
        const num = i.toString().padStart(2, '0');
        const img = document.createElement('img');
        img.src = `aslin gallery/IMG_87${num}.JPG`;
        img.className = 'gallery-item';
        img.onerror = () => img.remove();
        galleryContainer.appendChild(img);
    }
}

let currentLevelFilter = 'all';

window.filterStudents = (level) => {
    currentLevelFilter = level;
    loadAdminData();
};

window.loadAdminData = () => {
    if (!currentUser || currentUser.type !== 'admin') return;
    db.ref('students').on('value', snap => {
        const list = document.getElementById('admin-students-list');
        const select = document.getElementById('pay-st-id');
        if (!list) return;
        list.innerHTML = '';
        if (select) select.innerHTML = '<option value="">Select Student...</option>';

        let total = 0, boarding = 0, day = 0, level100 = 0, level200 = 0;
        const data = snap.val();

        // Get search query
        const searchInput = document.getElementById('admin-student-search');
        const query = searchInput ? searchInput.value.toLowerCase() : "";

        for (let id in data) {
            const student = data[id];
            total++;
            if (student.boarding) boarding++;
            else day++;

            if (student.level === '100') level100++;
            else if (student.level === '200') level200++;

            // Apply Level Filter
            if (currentLevelFilter !== 'all' && student.level !== currentLevelFilter) continue;

            // Apply Search Filter
            const nameMatch = student.name.toLowerCase().includes(query);
            const idMatch = (student.studentNumber || "").toLowerCase().includes(query);
            if (query && !nameMatch && !idMatch) continue;

            const tr = document.createElement('tr');
            const courseDisplay = student.courseStatus === 'Assigned' ? student.course : '<span style="color:#f1c40f; font-weight:600;">Not Assigned</span>';
            tr.innerHTML = `
                <td><strong>${student.studentNumber || 'N/A'}</strong></td>
                <td>${student.name}</td>
                <td>${courseDisplay}</td>
                <td>Level ${student.level || 'N/A'}</td>
                <td>${student.boarding ? 'Boarder' : 'Day Student'}</td>
                <td>
                    <button class="small-btn primary-btn" style="padding:5px 10px; margin-right:5px; border-radius:4px; cursor:pointer;" onclick="viewStudentDetails('${id}')">View Info</button>
                    <button class="small-btn" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" onclick="deleteStudent('${id}')">Delete</button>
                </td>`;
            list.appendChild(tr);
            if (select) {
                const opt = document.createElement('option');
                opt.value = id; opt.textContent = student.name;
                select.appendChild(opt);
            }
        }
        document.getElementById('stat-total-students').textContent = total;
        document.getElementById('stat-boarding').textContent = boarding;
        document.getElementById('stat-day').textContent = day;

        const l100Box = document.getElementById('stat-level-100');
        const l200Box = document.getElementById('stat-level-200');
        if (l100Box) l100Box.textContent = level100;
        if (l200Box) l200Box.textContent = level200;

        // Update Filter UI
        const indicator = document.getElementById('admin-filter-indicator');
        const clearBtn = document.getElementById('btn-clear-filter');
        if (indicator && clearBtn) {
            const queryText = query ? ` and matching "${query}"` : "";
            if (currentLevelFilter === 'all' && !query) {
                indicator.textContent = '';
                clearBtn.style.display = 'none';
            } else {
                indicator.textContent = currentLevelFilter === 'all'
                    ? `Showing students matching "${query}"`
                    : `Showing Level ${currentLevelFilter}${queryText}`;
                clearBtn.style.display = 'block';
            }
        }
    });

    db.ref('payments').on('value', async snap => {
        const list = document.getElementById('admin-payments-list');
        const dateInput = document.getElementById('admin-payment-date-search');
        const totalBox = document.getElementById('stat-payment-total');
        if (!list) return;
        list.innerHTML = '';
        
        const filterDate = dateInput ? dateInput.value : "";
        let totalSum = 0;
        
        const data = snap.val();
        const stSnap = await db.ref('students').once('value');
        const stData = stSnap.val() || {};
        for (let id in data) {
            const p = data[id];
            if (filterDate && p.date !== filterDate) continue;
            
            totalSum += parseFloat(p.amount || 0);
            
            const name = stData[p.studentId]?.name || 'Unknown';
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${name}</td><td>${p.type || 'Fees'}</td><td>GHC ${p.amount}</td><td>${p.date}</td><td>${p.method}</td><td>
                <a href="mailto:${stData[p.studentId]?.email}?subject=Receipt&body=Received GHC ${p.amount} for ${p.type || 'Fees'}" class="small-btn primary-btn" style="text-decoration:none; margin-right:5px;"><i class="fas fa-paper-plane"></i></a>
                <button class="small-btn" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;" onclick="deletePayment('${id}')"><i class="fas fa-trash"></i></button>
            </td>`;
            list.appendChild(tr);
        }
        
        if (totalBox) {
            totalBox.textContent = `GHC ${totalSum.toFixed(2)}`;
        }
    });

    // Load Admin Announcements
    db.ref('announcements').on('value', snap => {
        const list = document.getElementById('admin-announcements-list');
        if (!list) return;
        list.innerHTML = '';
        const data = snap.val();
        if (data) {
            for (let id in data) {
                const ann = data[id];
                const div = document.createElement('div');
                div.className = 'glass-card mb-3';
                div.style.padding = '15px';
                div.innerHTML = `
                    <div class="flex-between">
                        <strong>${ann.title}</strong>
                        <button class="small-btn" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:4px;" onclick="deleteAnnouncement('${id}')">Delete</button>
                    </div>
                    <p style="font-size:0.9rem; margin-top:5px;">${ann.message}</p>
                    <small class="text-muted">${ann.date}</small>
                `;
                list.appendChild(div);
            }
        } else {
            list.innerHTML = '<p class="text-muted">No announcements found.</p>';
        }
    });

    // Load Admin Complaints
    db.ref('complaints').on('value', snap => {
        const list = document.getElementById('admin-complaints-list');
        if (!list) return;
        list.innerHTML = '';
        const data = snap.val();
        if (data) {
            for (let id in data) {
                const comp = data[id];
                const div = document.createElement('div');
                div.className = 'glass-card mb-3';
                div.style.padding = '20px';
                div.style.borderLeft = '5px solid #dc3545';
                div.innerHTML = `
                    <div class="flex-between">
                        <strong>${comp.subject}</strong>
                        <button class="small-btn" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:4px;" onclick="deleteComplaint('${id}')">Archive</button>
                    </div>
                    <p style="margin: 10px 0; font-size:0.95rem;">${comp.message}</p>
                    <div class="flex-between" style="font-size:0.8rem; color:#666;">
                        <span>From: ${comp.studentName} (${comp.studentEmail})</span>
                        <span>${new Date(comp.createdAt).toLocaleDateString()}</span>
                    </div>
                `;
                list.appendChild(div);
            }
        } else {
            list.innerHTML = '<p class="text-muted">No complaints at the moment.</p>';
        }
    });

    // Load Class Rep Reports
    db.ref('classrep_reports').on('value', snap => {
        const list = document.getElementById('admin-classrep-reports-list');
        if (!list) return;
        list.innerHTML = '';
        const data = snap.val();
        if (data) {
            for (let id in data) {
                const rep = data[id];
                const div = document.createElement('div');
                div.className = 'glass-card mb-3';
                div.style.padding = '20px';
                div.style.borderLeft = '5px solid var(--accent-gold)';
                div.innerHTML = `
                    <div class="flex-between">
                        <strong>${rep.subject}</strong>
                        <button class="small-btn" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:4px;" onclick="deleteClassrepReport('${id}')">Archive</button>
                    </div>
                    <p style="margin: 10px 0; font-size:0.95rem;">${rep.message}</p>
                    <div class="flex-between" style="font-size:0.8rem; color:#666;">
                        <span>From: Level ${rep.level} Class Rep</span>
                        <span>${new Date(rep.createdAt).toLocaleDateString()}</span>
                    </div>
                `;
                list.appendChild(div);
            }
        } else {
            list.innerHTML = '<p class="text-muted">No information received yet.</p>';
        }
    });

    // Load Attendance Snapshots for Admin
    db.ref('attendance_snapshots').on('value', snap => {
        const grid = document.getElementById('admin-attendance-snapshots-list');
        if (!grid) return;

        const data = snap.val();
        grid.innerHTML = '';

        if (data) {
            // Sort by date descending
            const sorted = Object.entries(data).sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp));

            sorted.forEach(([id, s]) => {
                const card = document.createElement('div');
                card.className = 'course-category-card glass-card';
                card.style.padding = '1.5rem';

                card.innerHTML = `
                    <div style="font-size: 0.8rem; color: #666; margin-bottom: 5px;">Level ${s.level} â€¢ ${s.day}</div>
                    <h3 style="margin-bottom: 10px; color: var(--primary-blue);"><i class="fas fa-calendar-check"></i> ${new Date(s.date).toLocaleDateString()}</h3>
                    <div style="font-size: 0.85rem; margin-bottom: 15px;">
                        <span class="status-pill present">${s.records.length} Students marked</span>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button class="small-btn primary-btn" style="flex:1; padding:6px;" onclick="viewAdminSnapshot('${id}')">View List</button>
                        <button class="small-btn" style="flex:1; padding:6px; background:#dc3545; color:white; border:none; border-radius:4px;" onclick="deleteAttendanceSnapshot('${id}')"><i class="fas fa-trash"></i> Delete</button>
                    </div>
                `;
                grid.appendChild(card);
            });
        } else {
            grid.innerHTML = '<p class="text-muted">No saved registers found.</p>';
        }
    });

    // Load Hostel Bookings for Admin
    db.ref('hostel_bookings').on('value', snap => {
        const list = document.getElementById('admin-hostel-list');
        const totalBox = document.getElementById('admin-hostel-total');
        if (!list) return;

        list.innerHTML = '';

        const data = snap.val();
        let count = 0;

        if (data) {
            for (let id in data) {
                count++;
                const b = data[id];

                const tr = document.createElement('tr');
                const statusPill = b.status === 'Approved' ? '<span class="status-pill present">Approved</span>' : '<span class="status-pill warning" style="background:#f39c12; color:white;">Pending</span>';
                const actionButtons = b.status === 'Pending' ?
                    `<button class="small-btn" style="background:#28a745; color:white; border:none; padding:5px 10px; border-radius:4px; margin-right:5px;" onclick="approveHostelBooking('${id}')"><i class="fas fa-check"></i> Accept</button>` : '';

                tr.innerHTML = `
                    <td>${b.studentName}</td>
                    <td><strong>${b.studentNumber || 'N/A'}</strong></td>
                    <td>${b.hostel}</td>
                    <td>${b.room}</td>
                    <td>${statusPill}</td>
                    <td>
                        ${actionButtons}
                        <button class="small-btn" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px;" onclick="deleteHostelBooking('${id}')">Cancel/Remove</button>
                    </td>
                `;
                list.appendChild(tr);
            }
        }
        if (totalBox) totalBox.textContent = count;
        if (count === 0) {
            list.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hostel bookings found.</td></tr>';
        }
    });

    // Load Admin Attachments
    db.ref('attachments').on('value', snap => {
        const list = document.getElementById('admin-attachments-list');
        if (!list) return;
        list.innerHTML = '';
        const data = snap.val();
        if (data) {
            for (let id in data) {
                const att = data[id];
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div style="font-weight:600;">${att.studentName}</div>
                        <div style="font-size:0.8rem; color:#666;">${att.studentEmail}</div>
                    </td>
                    <td>${att.shopName}</td>
                    <td>${att.town}, ${att.region}</td>
                    <td>${att.ownerPhone}</td>
                    <td>${new Date(att.createdAt).toLocaleDateString()}</td>
                    <td>
                        <button class="small-btn primary-btn" onclick="viewAttachmentDetails('${id}')" style="margin-right:5px;"><i class="fas fa-eye"></i></button>
                        <button class="small-btn" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:4px;" onclick="deleteAttachment('${id}')"><i class="fas fa-trash"></i></button>
                    </td>
                `;
                list.appendChild(tr);
            }
        } else {
            list.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No attachments found.</td></tr>';
        }
    });
}

window.viewAttachmentDetails = async (id) => {
    const snap = await db.ref('attachments/' + id).once('value');
    const att = snap.val();
    if (att) {
        alert(`Attachment Details:\n\nStudent: ${att.studentName}\nShop: ${att.shopName}\nTown: ${att.town}\nRegion: ${att.region}\nDistrict: ${att.district}\nAddress: ${att.shopAddress}\nOwner Phone: ${att.ownerPhone}`);
    }
}


window.viewStudentDetails = async (id) => {
    try {
        const snap = await db.ref('students/' + id).once('value');
        const st = snap.val();
        if (!st) return;

        // Populate basic info
        document.getElementById('det-st-name').textContent = st.name;
        document.getElementById('det-st-id').textContent = st.studentNumber || 'N/A';
        document.getElementById('det-st-email').textContent = st.email;
        document.getElementById('det-st-gender').textContent = st.gender || 'Not specified';
        document.getElementById('det-st-level').textContent = `Level ${st.level || 'N/A'}`;
        document.getElementById('det-st-boarding').textContent = st.boarding ? 'Boarder' : 'Day Student';
        document.getElementById('det-st-course').textContent = st.course || 'Not Assigned';
        document.getElementById('det-st-reg-date').textContent = st.registeredAt ? new Date(st.registeredAt).toLocaleDateString() : 'N/A';

        const pic = document.getElementById('det-st-pic');
        if (st.passportPic) {
            pic.src = st.passportPic;
            pic.style.display = 'block';
        } else {
            pic.style.display = 'none';
        }

        // Fetch Hostel Room Info
        const hostelSnap = await db.ref('hostel_bookings').orderByChild('studentId').equalTo(id).once('value');
        const bookings = hostelSnap.val();
        const roomBox = document.getElementById('det-st-room');
        if (bookings) {
            const b = Object.values(bookings)[0];
            roomBox.textContent = `${b.hostel} - Room ${b.room}`;
        } else {
            roomBox.textContent = 'Not Booked';
        }

        // Fetch payments for this specific student
        const paySnap = await db.ref('payments').orderByChild('studentId').equalTo(id).once('value');
        const payments = paySnap.val();
        const list = document.getElementById('det-st-payments-list');
        list.innerHTML = '';

        if (payments) {
            Object.values(payments).sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${p.type || 'Fees'}</td>
                    <td style="font-weight:700; color:var(--accent-gold);">GHC ${parseFloat(p.amount).toFixed(2)}</td>
                    <td>${p.method}</td>
                    <td>${p.date}</td>
                `;
                list.appendChild(tr);
            });
        } else {
            list.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No payment records found.</td></tr>';
        }

        openModal('student-detail-modal');

        // Load student history
        currentViewedStudentId = id;
        loadStudentHistoryUI(id);
    } catch (err) {
        console.error(err);
        alert('Error loading student details');
    }
};

window.deleteAttachment = async (id) => {
    if (confirm('Delete this attachment record and reset the student portal?')) {
        const snap = await db.ref('attachments/' + id).once('value');
        const att = snap.val();
        if (att && att.studentId) {
            await db.ref('students/' + att.studentId).update({ attachmentSubmitted: false });
        }
        await db.ref('attachments/' + id).remove();
    }
}

window.deleteComplaint = async (id) => {
    if (confirm('Archive this complaint?')) {
        await db.ref('complaints/' + id).remove();
    }
}

window.deleteClassrepReport = async (id) => {
    if (confirm('Archive this information?')) {
        await db.ref('classrep_reports/' + id).remove();
    }
}

window.deleteAnnouncement = async (id) => {
    if (confirm('Delete this announcement?')) {
        await db.ref('announcements/' + id).remove();
    }
}

function loadStudentData() {
    if (!currentUser || currentUser.type !== 'student') return;
    const mini = document.querySelector('.student-profile-mini');
    if (mini) {
        mini.innerHTML = `<img src="${currentUser.passportPic || ''}" class="student-portal-pic" onerror="this.src='https://via.placeholder.com/100'"><span id="st-portal-name">${currentUser.name}</span>`;
    }
    document.getElementById('st-welcome-name').textContent = currentUser.firstName || currentUser.name;
    document.getElementById('st-profile-firstname').textContent = currentUser.firstName || '...';
    document.getElementById('st-profile-surname').textContent = currentUser.surname || '...';
    document.getElementById('st-profile-othername').textContent = currentUser.otherName || 'None';
    document.getElementById('st-profile-gender').textContent = currentUser.gender || 'Not Set';
    document.getElementById('st-profile-level').textContent = currentUser.level ? 'Level ' + currentUser.level : 'Not Set';
    document.getElementById('st-profile-attendance').textContent = `${currentUser.attendance || 0} times`;
    document.getElementById('st-profile-course').textContent = currentUser.course || 'Not Assigned';
    document.getElementById('st-profile-boarding').textContent = currentUser.boarding ? 'Boarder' : 'Day Student';

    // Load Student's Personal Payments
    db.ref('payments').on('value', snap => {
        const list = document.getElementById('st-payments-list');
        if (!list) return;
        list.innerHTML = '';
        const data = snap.val();
        let found = false;
        if (data) {
            for (let id in data) {
                const p = data[id];
                if (p.studentId === currentUser.id) {
                    found = true;
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${p.type || 'Fees'}</strong></td>
                        <td>GHC ${p.amount}</td>
                        <td>${p.date}</td>
                        <td>${p.method}</td>
                    `;
                    list.appendChild(tr);
                }
            }
        }
        if (!found) {
            list.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No payment records found.</td></tr>';
        }
    });

    // Load Live Announcements for Student
    db.ref('announcements').on('value', snap => {
        const list = document.getElementById('st-announcements-list');
        if (!list) return;
        list.innerHTML = '';
        const data = snap.val();
        if (data) {
            for (let id in data) {
                const ann = data[id];
                const div = document.createElement('div');
                div.className = 'glass-card mb-4';
                div.style.padding = '20px';
                div.innerHTML = `
                    <h3 style="color:var(--primary-blue); margin-bottom:10px;"><i class="fas fa-bell"></i> ${ann.title}</h3>
                    <p style="line-height:1.6;">${ann.message}</p>
                    <div style="margin-top:15px; font-size:0.8rem; color:#888;">Posted on: ${ann.date}</div>
                `;
                list.appendChild(div);
            }
        } else {
            list.innerHTML = '<div class="glass-card"><p class="text-muted">No new announcements at this time.</p></div>';
        }
    });

    // Load Student's Personal History/Notes
    db.ref(`students/${currentUser.id}/history`).on('value', snap => {
        const list = document.getElementById('st-history-list');
        if (!list) return;
        list.innerHTML = '';
        const history = snap.val();
        if (history) {
            Object.values(history).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach(h => {
                const div = document.createElement('div');
                div.className = 'student-history-item-clickable';
                div.style.padding = '12px';
                div.style.marginBottom = '10px';
                div.style.background = 'rgba(255,255,255,0.6)';
                div.style.borderRadius = '8px';
                div.style.borderLeft = '4px solid var(--accent-gold)';
                div.style.cursor = 'pointer';
                div.onclick = () => viewFullHistory(h.text, h.date);
                div.innerHTML = `
                    <div class="flex-between">
                        <p style="font-size:0.95rem; margin-bottom:5px; color: var(--text-dark); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;">${h.text}</p>
                        <i class="fas fa-chevron-right" style="color: var(--accent-gold); font-size: 0.8rem; margin-left: 10px;"></i>
                    </div>
                    <small style="color:#888; font-size:0.8rem;"><i class="far fa-calendar-alt"></i> ${h.date}</small>
                `;
                list.appendChild(div);
            });
        } else {
            list.innerHTML = '<p class="text-muted text-center py-4">No history or notes recorded yet.</p>';
        }
    });

    // Load Course Registration
    loadCourseRegistration();

    // Hostel Initialization
    loadHostelStatus();

    // Check attachment status
    if (currentUser.attachmentSubmitted) {
        const formEl = document.getElementById('form-student-attachment');
        if (formEl) formEl.style.display = 'none';
        const successMsg = document.getElementById('attachment-success-msg');
        if (successMsg) successMsg.style.display = 'block';
    } else {
        const formEl = document.getElementById('form-student-attachment');
        if (formEl) formEl.style.display = 'block';
        const successMsg = document.getElementById('attachment-success-msg');
        if (successMsg) successMsg.style.display = 'none';
    }

    startStudentSlideshow();
}

const hostelCapacity = {
    "Atta Kusi": {
        "Room 1": 8, "Room 2": 8, "Room 3": 8, "Room 4": 8,
        "Room 5": 6, "Room 6": 14, "Room 7": 6, "Room 8": 4,
        "Room 9": 6, "Room 10": 8, "Room 11": 12
    },
    "Adomako": {
        "Room 1": 6, "Room 2": 8, "Room 3": 8, "Room 4": 8,
        "Room 5": 8, "Room 6": 6
    }
};

window.updateRoomOptions = async () => {
    const hostel = document.getElementById('hostel-select').value;
    const roomSelect = document.getElementById('room-select');
    if (!roomSelect) return;

    roomSelect.innerHTML = '<option value="">-- Loading Rooms... --</option>';

    if (!hostel) {
        roomSelect.innerHTML = '<option value="">-- Choose Hostel First --</option>';
        return;
    }

    const rooms = hostelCapacity[hostel];
    let html = '<option value="">-- Choose Room --</option>';

    // Get all current bookings to check occupancy
    const snap = await db.ref('hostel_bookings').once('value');
    const allBookings = snap.val() || {};

    for (let roomName in rooms) {
        const capacity = rooms[roomName];
        const occupancy = Object.values(allBookings).filter(b => b.hostel === hostel && b.room === roomName).length;
        const isFull = occupancy >= capacity;

        html += `<option value="${roomName}" ${isFull ? 'disabled' : ''}>
            ${roomName} (${occupancy}/${capacity}) ${isFull ? '- FULL' : ''}
        </option>`;
    }

    roomSelect.innerHTML = html;
};

window.bookHostelRoom = async () => {
    if (!currentUser || currentUser.type !== 'student') return;

    const hostel = document.getElementById('hostel-select').value;
    const room = document.getElementById('room-select').value;

    if (!hostel || !room) {
        alert("Please select both a hostel and a room.");
        return;
    }

    try {
        // Double check occupancy right before booking
        const snap = await db.ref('hostel_bookings').once('value');
        const allBookings = snap.val() || {};
        const occupancy = Object.values(allBookings).filter(b => b.hostel === hostel && b.room === room).length;
        const capacity = hostelCapacity[hostel][room];

        if (occupancy >= capacity) {
            alert("Sorry, this room just became full. Please choose another.");
            updateRoomOptions();
            return;
        }

        const bookingData = {
            studentId: currentUser.id,
            studentName: currentUser.name,
            studentNumber: currentUser.studentNumber,
            hostel: hostel,
            room: room,
            status: 'Pending',
            timestamp: new Date().toISOString()
        };

        await db.ref('hostel_bookings').child(currentUser.id).set(bookingData);
        alert("Your room request has been submitted for approval.");
        loadHostelStatus();
    } catch (e) {
        alert("Booking failed. Please try again.");
    }
};

window.cancelMyHostelRequest = async () => {
    if (!currentUser) return;
    if (confirm("Are you sure you want to cancel your hostel request?")) {
        await db.ref('hostel_bookings').child(currentUser.id).remove();
        alert("Request cancelled.");
        loadHostelStatus();
    }
};

window.approveHostelBooking = async (studentId) => {
    try {
        await db.ref('hostel_bookings').child(studentId).update({ status: 'Approved' });
        alert("Booking approved successfully!");
    } catch (e) {
        alert("Failed to approve booking.");
    }
};

window.loadHostelStatus = async () => {
    if (!currentUser || currentUser.type !== 'student') return;

    const snap = await db.ref('hostel_bookings').child(currentUser.id).once('value');
    const booking = snap.val();

    const infoBox = document.getElementById('hostel-info-box');
    const successBox = document.getElementById('hostel-success-box');
    const details = document.getElementById('assigned-hostel-details');
    const badge = document.getElementById('hostel-status-badge');

    const icon = document.getElementById('hostel-status-icon');
    const title = document.getElementById('hostel-status-title');
    const msg = document.getElementById('hostel-status-msg');

    if (booking) {
        if (infoBox) infoBox.style.display = 'none';
        if (successBox) successBox.style.display = 'block';
        if (details) details.textContent = `${booking.hostel} - ${booking.room}`;

        if (booking.status === 'Approved') {
            if (icon) icon.innerHTML = '<i class="fas fa-check-circle"></i>';
            if (icon) icon.style.color = '#28a745';
            if (title) title.textContent = 'Booking Confirmed!';
            if (title) title.style.color = '#28a745';
            if (msg) msg.textContent = 'Your room assignment has been approved. Welcome to the hostel!';
            if (badge) badge.innerHTML = '<span class="status-pill present">Approved</span>';
            const cancelBtn = document.getElementById('btn-cancel-own-booking');
            if (cancelBtn) cancelBtn.style.display = 'none';
        } else {
            if (icon) icon.innerHTML = '<i class="fas fa-clock"></i>';
            if (icon) icon.style.color = '#f39c12';
            if (title) title.textContent = 'Request Pending';
            if (title) title.style.color = '#f39c12';
            if (msg) msg.textContent = 'Your request is being reviewed by the administration.';
            if (badge) badge.innerHTML = '<span class="status-pill warning" style="background:#f39c12; color:white;">Pending Approval</span>';
        }
    } else {
        if (infoBox) infoBox.style.display = 'block';
        if (successBox) successBox.style.display = 'none';
        if (badge) badge.innerHTML = '<span class="status-pill absent">Not Assigned</span>';
    }
};

window.deleteHostelBooking = async (studentId) => {
    if (confirm("Are you sure you want to remove this hostel booking?")) {
        await db.ref('hostel_bookings').child(studentId).remove();
        alert("Booking removed.");
    }
};

window.toggleCourseSelection = (card) => {
    if (currentUser.courseStatus === 'Assigned') return; // Prevent toggling if already registered
    card.classList.toggle('selected');
    const icon = card.querySelector('.fa-check-circle');
    if (card.classList.contains('selected')) {
        icon.style.color = '#28a745';
        card.style.borderColor = '#28a745';
        card.style.background = '#e8f5e9';
    } else {
        icon.style.color = '#ccc';
        card.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        card.style.background = 'rgba(255, 255, 255, 0.85)';
    }
};

window.registerStudentCourses = async () => {
    if (!currentUser || currentUser.type !== 'student') return;

    const selectedCards = document.querySelectorAll('.course-category-card.selected');
    if (selectedCards.length === 0) {
        alert("Please tap on the courses to select them before registering.");
        return;
    }

    const selectedCourses = Array.from(selectedCards).map(card => card.getAttribute('data-course-name'));
    const level = currentUser.level || "100";

    try {
        await db.ref(`students/${currentUser.id}`).update({
            course: `Level ${level} Curriculum (${selectedCourses.length} courses)`,
            registeredCourses: selectedCourses,
            registrationLevel: level,
            courseStatus: 'Assigned'
        });

        currentUser.course = `Level ${level} Curriculum (${selectedCourses.length} courses)`;
        currentUser.registeredCourses = selectedCourses;
        currentUser.registrationLevel = level;
        currentUser.courseStatus = 'Assigned';

        alert(`Successfully registered for ${selectedCourses.length} Level ${level} courses!`);
        loadCourseRegistration();
        loadStudentData();
    } catch (err) {
        alert("Registration failed. Check connection.");
    }
};

window.loadCourseRegistration = () => {
    if (!currentUser || currentUser.type !== 'student') return;

    const level = currentUser.level || "100";
    const regLevelNum = document.getElementById('reg-level-num');
    const coursesList = document.getElementById('courses-to-register-list');
    const registerBtn = document.getElementById('btn-register-courses');
    const alreadyMsg = document.getElementById('already-registered-msg');
    const summary = document.getElementById('registered-courses-summary');
    const statusBadge = document.getElementById('course-reg-status-badge');

    if (!regLevelNum || !coursesList) return;

    regLevelNum.textContent = level;

    const isRegisteredForCurrentLevel = currentUser.registrationLevel === level && currentUser.courseStatus === 'Assigned';

    if (isRegisteredForCurrentLevel) {
        coursesList.style.display = 'none';
        registerBtn.style.display = 'none';
        alreadyMsg.style.display = 'block';
        summary.textContent = `You are currently registered for ${currentUser.registeredCourses?.length || 0} Level ${level} courses: ${currentUser.registeredCourses?.join(', ') || ''}.`;
        if (statusBadge) statusBadge.innerHTML = '<span class="status-pill present">Status: Assigned</span>';
    } else {
        coursesList.style.display = 'grid';
        registerBtn.style.display = 'block';
        alreadyMsg.style.display = 'none';
        if (statusBadge) statusBadge.innerHTML = '<span class="status-pill absent">Status: Not Assigned</span>';

        const courses = level === "100" ? [
            "Garment Construction & Design", "Dress Making (Ladies Wear)",
            "Tailoring (Men's Wear)", "Millinery", "Bead Making",
            "Occasional Wear", "Modeling"
        ] : [
            "Wedding Gown", "Suit Making", "Boning",
            "Batik Making", "Decoration", "Tie and Dye"
        ];

        coursesList.innerHTML = courses.map(c => `
            <div class="course-category-card glass-card clickable-course" 
                 style="padding: 1rem; cursor: pointer; border: 2px solid transparent; transition: all 0.3s ease;" 
                 onclick="toggleCourseSelection(this)" data-course-name="${c}">
                <h4 style="font-size: 0.9rem; display: flex; justify-content: space-between; align-items: center;">
                    ${c} <i class="fas fa-check-circle" style="color: #ccc;"></i>
                </h4>
            </div>
        `).join('');
    }
};

let slideshowInterval;
function startStudentSlideshow() {
    const slideImg = document.getElementById('st-slide-img');
    if (!slideImg) return;

    const images = [
        "aslin gallery/IMG_8717.JPG",
        "aslin gallery/IMG_8718.JPG",
        "aslin gallery/IMG_8719.JPG"
    ];
    let currentIndex = 0;

    const changeSlide = () => {
        slideImg.src = images[currentIndex];
        currentIndex = (currentIndex + 1) % images.length;
    };

    if (slideshowInterval) clearInterval(slideshowInterval);
    changeSlide();
    slideshowInterval = setInterval(changeSlide, 4000);
}

window.logout = () => { currentUser = null; navigateTo('home-section'); };
window.openModal = id => document.getElementById(id).classList.add('active');
window.closeModal = id => document.getElementById(id).classList.remove('active');
window.deleteStudent = id => confirm('Delete student?') && db.ref('students/' + id).remove();
window.deletePayment = id => confirm('Are you sure you want to delete this payment record? This will also remove it from the student portal.') && db.ref('payments/' + id).remove();

window.promoteStudent = async (id, currentLevel) => {
    let newLevel = prompt("Enter new level for this student (e.g., 100 or 200):", currentLevel);
    if (newLevel && newLevel !== currentLevel) {
        // When promoted, reset course status so they must register for new level courses
        await db.ref('students/' + id).update({
            level: newLevel,
            courseStatus: 'Not Assigned',
            course: 'Pending New Level Registration'
        });
        alert("Student level updated! They will need to register for Level " + newLevel + " courses in their portal.");
    }
}

window.resetClassAttendance = async () => {
    if (!currentUser || currentUser.type !== 'classrep') return;
    if (confirm(`Are you sure you want to delete the semester's register and reset all attendance to 0 for Level ${currentUser.level}?`)) {
        const snap = await db.ref('students').once('value');
        const data = snap.val();
        if (data) {
            const updates = {};
            for (let id in data) {
                if (data[id].level === currentUser.level) {
                    updates[id + '/attendance'] = 0;
                    updates[id + '/attendanceLogs'] = null;
                }
            }
            await db.ref('students').update(updates);
            alert(`Level ${currentUser.level} student attendance registers have been reset.`);
        }
    }
}

window.switchStudentTab = (tabId) => {
    document.querySelectorAll('.student-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[data-student-tab]').forEach(t => t.classList.remove('active'));

    const targetTab = document.getElementById(`student-${tabId}-tab`);
    const targetLink = document.querySelector(`[data-student-tab="${tabId}"]`);

    if (targetTab) targetTab.classList.add('active');
    if (targetLink) targetLink.classList.add('active');
}

window.switchAdminTab = (tabId) => {
    document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[data-admin-tab]').forEach(t => t.classList.remove('active'));

    const targetTab = document.getElementById(`admin-${tabId}-tab`);
    const targetLink = document.querySelector(`[data-admin-tab="${tabId}"]`);

    if (targetTab) targetTab.classList.add('active');
    if (targetLink) targetLink.classList.add('active');
}

function switchClassrepTab(tabId) {
    document.querySelectorAll('.classrep-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[data-classrep-tab]').forEach(t => t.classList.remove('active'));

    const targetTab = document.getElementById(`classrep-${tabId}-tab`);
    const targetLink = document.querySelector(`[data-classrep-tab="${tabId}"]`);

    if (targetTab) targetTab.classList.add('active');
    if (targetLink) targetLink.classList.add('active');
}

// Student History Logic
window.saveStudentHistory = async () => {
    const textInput = document.getElementById('add-history-text');
    const text = textInput.value.trim();
    if (!text || !currentViewedStudentId) return;

    const historyData = {
        text,
        date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: new Date().toISOString()
    };

    try {
        await db.ref(`students/${currentViewedStudentId}/history`).push(historyData);
        textInput.value = '';
        loadStudentHistoryUI(currentViewedStudentId);
    } catch (err) {
        alert('Failed to save history entry.');
    }
};

window.deleteStudentHistory = async (historyId) => {
    if (!currentViewedStudentId) return;
    if (confirm('Are you sure you want to delete this history entry?')) {
        try {
            await db.ref(`students/${currentViewedStudentId}/history/${historyId}`).remove();
            loadStudentHistoryUI(currentViewedStudentId);
        } catch (err) {
            alert('Failed to delete history entry.');
        }
    }
};

async function loadStudentHistoryUI(studentId) {
    const snap = await db.ref(`students/${studentId}/history`).once('value');
    const history = snap.val();
    const list = document.getElementById('det-st-history-list');
    if (!list) return;
    list.innerHTML = '';

    if (history) {
        Object.entries(history).sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp)).forEach(([id, h]) => {
            const div = document.createElement('div');
            div.className = 'flex-between';
            div.style.padding = '12px 0';
            div.style.borderBottom = '1px solid #edf2f7';
            div.innerHTML = `
                <div style="flex: 1; padding-right: 15px;">
                    <p style="font-size:0.95rem; margin-bottom:5px; color: #2d3748;">${h.text}</p>
                    <small style="color:#a0aec0; font-size:0.8rem;">${h.date}</small>
                </div>
                <button class="small-btn" style="background:#dc3545; color:white; border:none; padding:5px 8px; border-radius:4px; cursor:pointer;" onclick="deleteStudentHistory('${id}')">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            list.appendChild(div);
        });
    } else {
        list.innerHTML = '<p class="text-muted text-center py-3">No history recorded yet.</p>';
    }
}

window.viewFullHistory = (text, date) => {
    document.getElementById('hist-modal-date').textContent = date;
    document.getElementById('hist-modal-text').textContent = text;
    openModal('history-detail-modal');
};

window.downloadStudentData = async () => {
    if (!currentViewedStudentId) return;

    try {
        const studentSnap = await db.ref(`students/${currentViewedStudentId}`).once('value');
        const student = studentSnap.val();
        if (!student) throw new Error('Student data not found');

        // 1. Populate Profile Details
        document.getElementById('rep-id-display').textContent = 'GFA-' + Math.floor(Math.random() * 1000000);
        document.getElementById('rep-date-display').textContent = new Date().toLocaleDateString();
        document.getElementById('rep-name').textContent = student.fullname || student.name || 'N/A';
        document.getElementById('rep-sid').textContent = student.studentNumber || currentViewedStudentId;
        document.getElementById('rep-level').textContent = student.currentLevel || `Level ${student.level || '1'}`;
        document.getElementById('rep-gender').textContent = student.gender || 'N/A';
        document.getElementById('rep-boarding').textContent = student.boarding ? 'Boarder' : 'Day Student';
        document.getElementById('rep-email').textContent = student.email || 'N/A';
        document.getElementById('rep-pic').src = student.passportPic || student.profilePic || 'logo.PNG';

        // 2. Populate Payments
        const payList = document.getElementById('rep-payments-list');
        payList.innerHTML = '';
        if (student.payments) {
            Object.values(student.payments).forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">${p.date}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">${p.type}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee;">${p.method}</td>
                    <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-weight: 700;">${p.amount}</td>
                `;
                payList.appendChild(tr);
            });
        } else {
            payList.innerHTML = '<tr><td colspan="4" style="padding: 20px; text-align: center; color: #94a3b8;">No payment records found.</td></tr>';
        }

        // 3. Populate History
        const histList = document.getElementById('rep-history-list');
        histList.innerHTML = '';
        if (student.history) {
            Object.values(student.history).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach(h => {
                const div = document.createElement('div');
                div.style.padding = '15px';
                div.style.borderBottom = '1px solid #edf2f7';
                div.innerHTML = `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="font-weight: 700; color: var(--primary-blue); font-size: 0.9rem;">ACADEMIC NOTE</span>
                        <span style="font-size: 0.8rem; color: #94a3b8;">${h.date}</span>
                    </div>
                    <p style="margin: 0; font-size: 0.95rem; color: #1e293b; line-height: 1.5;">${h.text}</p>
                `;
                histList.appendChild(div);
            });
        } else {
            histList.innerHTML = '<p style="padding: 20px; text-align: center; color: #94a3b8;">No academic history recorded.</p>';
        }

        // 4. Populate Hostel & Room
        const hSnap = await db.ref('hostel_bookings').orderByChild('studentId').equalTo(currentViewedStudentId).once('value');
        const bks = hSnap.val();
        if (bks) {
            const b = Object.values(bks)[0];
            document.getElementById('rep-hostel').textContent = b.hostel;
            document.getElementById('rep-room').textContent = `Room ${b.room}`;
        } else {
            document.getElementById('rep-hostel').textContent = 'Not Assigned';
            document.getElementById('rep-room').textContent = 'No active booking';
        }


        // 5. Populate Courses
        const courseList = document.getElementById('rep-courses-list');
        courseList.innerHTML = '';
        if (student.registeredCourses) {
            student.registeredCourses.forEach(c => {
                const span = document.createElement('span');
                span.style.background = '#f1f5f9';
                span.style.padding = '5px 12px';
                span.style.borderRadius = '20px';
                span.style.fontSize = '0.85rem';
                span.style.fontWeight = '600';
                span.style.color = '#475569';
                span.style.border = '1px solid #e2e8f0';
                span.textContent = c;
                courseList.appendChild(span);
            });
        } else {
            courseList.innerHTML = '<p style="color: #94a3b8; font-style: italic;">No courses registered yet.</p>';
        }

        // 6. Open Modal
        openModal('student-report-modal');
        
    } catch (err) {
        console.error(err);
        alert('Error generating report: ' + err.message);
    }
};

window.downloadAsImage = () => {
    const report = document.getElementById('printable-report');
    const btn = event.currentTarget;
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    
    html2canvas(report, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: 900,
        windowHeight: report.scrollHeight + 200
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = `GFA_Report_${document.getElementById('rep-name').textContent.replace(/\s+/g, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        btn.disabled = false;
        btn.innerHTML = originalText;
    }).catch(err => {
        console.error(err);
        alert('Failed to generate image. Please try the Print option.');
        btn.disabled = false;
        btn.innerHTML = originalText;
    });
};

window.printReport = () => {
    const printContent = document.getElementById('printable-report').innerHTML;
    const originalContent = document.body.innerHTML;

    // Create print window
    const printWindow = window.open('', '', 'height=1000,width=900');
    printWindow.document.write('<html><head><title>GFA Student Report</title>');
    // Include fonts and basic styles
    printWindow.document.write('<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">');
    printWindow.document.write('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">');
    printWindow.document.write('<style>body{margin:0;padding:0;}.modal-content{box-shadow:none !important;} :root { --primary-blue: #0A2540; --accent-gold: #D4AF37; }</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write(printContent);
    printWindow.document.write('</body></html>');
    printWindow.document.close();

    // Wait for assets to load then print
    printWindow.onload = function () {
        printWindow.print();
        printWindow.close();
    };
};

function fileToBase64(file) { return new Promise((res, rej) => { const r = new FileReader(); r.readAsDataURL(file); r.onload = () => res(r.result); r.onerror = e => rej(e); }); }

// Class Rep Portal Functions
window.showClassrepLogin = (level) => {
    document.getElementById('classrep-login-form').style.display = 'block';
    document.getElementById('classrep-level-title').textContent = `Level ${level} Login`;
    document.getElementById('classrep-level-input').value = level;
    document.getElementById('classrep-error').textContent = '';
};

window.loginClassrep = () => {
    const level = document.getElementById('classrep-level-input').value;
    const pwd = document.getElementById('classrep-password').value;
    const errorMsg = document.getElementById('classrep-error');

    if ((level === '100' && pwd === 'Classrep100') || (level === '200' && pwd === 'Classrep200')) {
        currentUser = { type: 'classrep', level: level };
        closeModal('classrep-modal');
        document.getElementById('classrep-password').value = '';
        navigateTo('classrep-section');
    } else {
        errorMsg.textContent = 'Invalid Password';
    }
};

window.markAttendance = async (studentId, status) => {
    if (!currentUser || currentUser.type !== 'classrep') return;

    const today = new Date().toISOString().split('T')[0];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = days[new Date().getDay()];

    try {
        const ref = db.ref('students/' + studentId);
        const snap = await ref.once('value');
        const data = snap.val();
        if (data) {
            const logs = data.attendanceLogs || {};
            let newAttendance = data.attendance || 0;
            const previousStatus = logs[today]?.status;

            if (previousStatus !== 'Present' && status === 'Present') {
                newAttendance += 1;
            } else if (previousStatus === 'Present' && status === 'Absent') {
                newAttendance = Math.max(0, newAttendance - 1);
            }

            logs[today] = {
                status: status,
                day: day,
                timestamp: new Date().toISOString()
            };
            await ref.update({ attendance: newAttendance, attendanceLogs: logs });
        }
    } catch (e) {
        console.error(e);
        alert('Error marking attendance');
    }
};

window.saveProgress = async () => {
    if (!currentUser || currentUser.type !== 'classrep') return;

    const todayISO = new Date().toISOString().split('T')[0];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[new Date().getDay()];

    try {
        const snap = await db.ref('students').once('value');
        const students = snap.val();
        const records = [];

        if (students) {
            for (let id in students) {
                if (students[id].level === currentUser.level) {
                    const logs = students[id].attendanceLogs || {};
                    records.push({
                        studentId: id,
                        status: logs[todayISO]?.status || 'Not Marked'
                    });
                }
            }
        }

        const draftData = {
            level: currentUser.level,
            date: todayISO,
            day: dayName,
            timestamp: new Date().toISOString(),
            records: records
        };

        await db.ref('attendance_drafts').push(draftData);
        alert("Progress saved as a DRAFT. You can find it in the 'Drafts & Progress' tab to resume later.");
        loadAttendanceDrafts();
    } catch (e) {
        alert("Failed to save progress.");
    }
};

window.loadAttendanceDrafts = async () => {
    if (!currentUser || currentUser.type !== 'classrep') return;
    const list = document.getElementById('classrep-drafts-list');
    if (!list) return;

    db.ref('attendance_drafts').orderByChild('level').equalTo(currentUser.level).on('value', snap => {
        const drafts = snap.val();
        list.innerHTML = '';

        if (drafts) {
            const sorted = Object.entries(drafts).sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp));
            sorted.forEach(([id, d]) => {
                const card = document.createElement('div');
                card.className = 'course-category-card glass-card';
                card.style.padding = '1.5rem';

                card.innerHTML = `
                    <div style="font-size: 0.8rem; color: #666; margin-bottom: 5px;">${d.day} â€¢ Draft</div>
                    <h3 style="margin-bottom: 10px; color: var(--primary-blue);"><i class="fas fa-edit"></i> ${new Date(d.date).toLocaleDateString()}</h3>
                    <div style="font-size: 0.85rem; margin-bottom: 15px;">
                        <span style="background:var(--primary-blue-light); color:white; padding:3px 10px; border-radius:12px;">${d.records.length} Students marked</span>
                    </div>
                    <button class="small-btn primary-btn" style="width:100%;" onclick="resumeDraft('${id}')">Resume Marking</button>
                    <button class="small-btn" style="width:100%; margin-top:5px; background:#eee; color:#666; border:none;" onclick="deleteDraft('${id}')">Discard</button>
                `;
                list.appendChild(card);
            });
        } else {
            list.innerHTML = '<p class="text-muted">No active drafts found.</p>';
        }
    });
};

window.resumeDraft = async (id) => {
    const snap = await db.ref('attendance_drafts/' + id).once('value');
    const d = snap.val();
    if (!d) return;

    if (confirm("Resume this draft? This will overwrite any current markings on your register for today.")) {
        const updates = {};
        const todayISO = new Date().toISOString().split('T')[0];
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const day = days[new Date().getDay()];

        d.records.forEach(rec => {
            updates[`students/${rec.studentId}/attendanceLogs/${todayISO}`] = {
                status: rec.status,
                day: day,
                timestamp: new Date().toISOString()
            };
        });

        await db.ref().update(updates);
        activeDraftId = id; // Store the ID of the resumed draft

        alert("Draft loaded into register! Switch to the 'Register' tab to finish marking.");

        // Visual indicator
        const badge = document.getElementById('register-status-badge');
        if (badge) badge.style.display = 'inline-block';

        // Navigate back to register
        switchClassrepTab('dashboard');
    }
};

window.deleteDraft = async (id) => {
    if (confirm("Are you sure you want to discard this draft?")) {
        await db.ref('attendance_drafts/' + id).remove();
        alert("Draft discarded.");
    }
};

window.saveDayAttendance = async () => {
    if (!currentUser || currentUser.type !== 'classrep') return;

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[new Date().getDay()];
    const todayISO = new Date().toISOString().split('T')[0];

    if (!confirm(`FINAL SUBMISSION: Are you sure you want to PERMANENTLY save and close this register? \n\nOnce submitted, this session CANNOT be edited, and it will be sent directly to the Admin for review.`)) {
        return;
    }

    try {
        const snap = await db.ref('students').once('value');
        const students = snap.val();
        const attendanceRecord = [];
        const updates = {};

        if (students) {
            for (let id in students) {
                if (students[id].level === currentUser.level) {
                    const logs = students[id].attendanceLogs || {};
                    const statusToday = logs[todayISO]?.status || 'Not Marked';

                    attendanceRecord.push({
                        studentId: id,
                        name: students[id].name,
                        studentNumber: students[id].studentNumber,
                        status: statusToday
                    });

                    // Clear today's log for the "clean sheet"
                    updates[`students/${id}/attendanceLogs/${todayISO}`] = null;
                }
            }
        }

        if (attendanceRecord.length === 0) {
            alert('No students found to save.');
            return;
        }

        // 1. Store the snapshot in a dedicated history table
        const snapshotData = {
            level: currentUser.level,
            day: dayName,
            date: todayISO,
            timestamp: new Date().toISOString(),
            savedBy: `Level ${currentUser.level} Rep`,
            records: attendanceRecord
        };
        await db.ref('attendance_snapshots').push(snapshotData);

        // 2. Clear the current register (Clean Sheet)
        await db.ref().update(updates);

        // 3. Clear the draft if one was active
        if (activeDraftId) {
            await db.ref('attendance_drafts/' + activeDraftId).remove();
            activeDraftId = null;
            const badge = document.getElementById('register-status-badge');
            if (badge) badge.style.display = 'none';
        }

        alert(`SUCCESS!\nAttendance for ${dayName} has been stored.\nA clean sheet is now ready.`);
        loadClassrepData();
    } catch (e) {
        console.error(e);
        alert('Failed to save and clear attendance.');
    }
};

window.loadAttendanceHistory = async () => {
    if (!currentUser || currentUser.type !== 'classrep') return;
    const grid = document.getElementById('history-sessions-grid');
    if (!grid) return;

    grid.innerHTML = '<p class="text-muted">Loading logs...</p>';

    try {
        const snap = await db.ref('attendance_snapshots').orderByChild('level').equalTo(currentUser.level).once('value');
        const snapshots = snap.val();
        grid.innerHTML = '';

        if (!snapshots) {
            grid.innerHTML = '<p class="text-muted">No saved registers found.</p>';
            return;
        }

        // Sort by date/timestamp descending
        const sorted = Object.entries(snapshots).sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp));

        sorted.forEach(([id, s]) => {
            const card = document.createElement('div');
            card.className = 'course-category-card glass-card';
            card.style.padding = '1.5rem';
            card.style.cursor = 'pointer';
            card.onclick = () => viewSnapshotDetails(id, s);

            card.innerHTML = `
                <div style="font-size: 0.8rem; color: #666; margin-bottom: 5px;">${s.day}</div>
                <h3 style="margin-bottom: 10px; color: var(--primary-blue);"><i class="fas fa-calendar-check"></i> ${new Date(s.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</h3>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.85rem; background: #eee; padding: 3px 10px; border-radius: 12px;">${s.records.length} Students</span>
                    <span style="font-size: 0.8rem; color: var(--accent-gold);">View List <i class="fas fa-chevron-right"></i></span>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (e) {
        console.error(e);
        grid.innerHTML = '<p class="text-danger">Failed to load logs.</p>';
    }
};

window.viewSnapshotDetails = (id, s) => {
    document.getElementById('history-list-view').style.display = 'none';
    const detailView = document.getElementById('history-detail-view');
    detailView.style.display = 'block';

    document.getElementById('snapshot-title').textContent = `${s.day}, ${new Date(s.date).toLocaleDateString()}`;
    document.getElementById('snapshot-meta').textContent = `Saved at ${new Date(s.timestamp).toLocaleTimeString()} â€¢ ${s.records.length} Students`;

    const list = document.getElementById('classrep-history-detail-list');
    list.innerHTML = '';

    s.records.forEach(rec => {
        let statusHtml = '<span class="status-pill" style="color:#888;">Not Marked</span>';
        if (rec.status === 'Present') statusHtml = '<span class="status-pill present"><i class="fas fa-check-circle"></i> Present</span>';
        else if (rec.status === 'Absent') statusHtml = '<span class="status-pill absent"><i class="fas fa-times-circle"></i> Absent</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${rec.studentNumber || 'N/A'}</strong></td>
            <td>${rec.name}</td>
            <td>${statusHtml}</td>
        `;
        list.appendChild(tr);
    });
};

window.deleteAttendanceSnapshot = async (id) => {
    if (confirm("DANGER: Are you sure you want to PERMANENTLY delete this attendance register? This cannot be undone.")) {
        await db.ref('attendance_snapshots/' + id).remove();
        alert("Session register deleted.");
    }
};

window.viewAdminSnapshot = async (id) => {
    const snap = await db.ref('attendance_snapshots/' + id).once('value');
    const s = snap.val();
    if (!s) return;

    document.getElementById('adm-snap-title').textContent = `${s.day}, ${new Date(s.date).toLocaleDateString()}`;
    document.getElementById('adm-snap-meta').textContent = `Level ${s.level} â€¢ Saved at ${new Date(s.timestamp).toLocaleTimeString()}`;

    const list = document.getElementById('adm-snap-list');
    list.innerHTML = '';

    s.records.forEach(r => {
        let statusHtml = '<span class="status-pill" style="color:#888;">Not Marked</span>';
        if (r.status === 'Present') statusHtml = '<span class="status-pill present"><i class="fas fa-check-circle"></i> Present</span>';
        else if (r.status === 'Absent') statusHtml = '<span class="status-pill absent"><i class="fas fa-times-circle"></i> Absent</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${r.studentNumber || 'N/A'}</strong></td>
            <td>${r.name}</td>
            <td>${statusHtml}</td>
        `;
        list.appendChild(tr);
    });

    openModal('admin-attendance-detail-modal');
};

window.loadClassrepData = async () => {
    if (!currentUser || currentUser.type !== 'classrep') return;
    document.getElementById('classrep-portal-name').textContent = `Level ${currentUser.level} Rep`;

    // Set Date Display
    const dateEl = document.getElementById('cr-date-display');
    if (dateEl) {
        const today = new Date();
        dateEl.textContent = today.toLocaleDateString('en-GB', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    const today = new Date().toISOString().split('T')[0];

    loadAttendanceHistory();
    loadAttendanceDrafts();

    db.ref('students').on('value', snap => {
        const list = document.getElementById('classrep-students-list');
        if (!list) return;
        list.innerHTML = '';
        const data = snap.val();
        let found = false;
        for (let id in data) {
            if (data[id].level === currentUser.level) {
                found = true;
                const logs = data[id].attendanceLogs || {};
                const statusToday = logs[today]?.status;

                const tr = document.createElement('tr');

                // Create buttons with active states
                let presentBtnClass = statusToday === 'Present' ? 'attendance-btn present active' : 'attendance-btn present';
                let absentBtnClass = statusToday === 'Absent' ? 'attendance-btn absent active' : 'attendance-btn absent';

                tr.innerHTML = `
                    <td><strong>${data[id].studentNumber || 'N/A'}</strong></td>
                    <td>${data[id].name}</td>
                    <td>Level ${data[id].level}</td>
                    <td>
                        <div class="attendance-actions">
                            <button class="${presentBtnClass}" onclick="markAttendance('${id}', 'Present')">
                                <i class="fas fa-check"></i> Present
                            </button>
                            <button class="${absentBtnClass}" onclick="markAttendance('${id}', 'Absent')">
                                <i class="fas fa-times"></i> Absent
                            </button>
                        </div>
                    </td>
                `;
                list.appendChild(tr);
            }
        }
        if (!found) {
            list.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No students found in this level.</td></tr>';
        }
    });
};

// ========================
// INTRODUCTORY LETTER GENERATOR
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
        img.src = "logo.PNG";
    });
}

function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function downloadAttachmentLetter() {
    if (!currentUser) {
        alert("You must be logged in to download the letter.");
        return;
    }

    const fullName = currentUser.name || "Student";
    const gender = currentUser.gender || "Male";
    const pronoun = gender === "Female" ? "She" : "He";
    const pronounLower = gender === "Female" ? "she" : "he";
    const possessive = gender === "Female" ? "her" : "his";
    const objectPronoun = gender === "Female" ? "her" : "him";
    
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const logoDataUrl = await getLogoDataUrl();
    const logoHtml = logoDataUrl
        ? `<img src="${logoDataUrl}" alt="GFA Logo" style="width: 110px; height: 110px; object-fit: contain;" />`
        : `<div style="width: 110px; height: 110px; border-radius: 50%; background: linear-gradient(135deg, #003366, #FFD700); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 24px;">GFA</div>`;

    const letterHtml = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>Introductory Letter - ${escapeHtml(fullName)}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Outfit', sans-serif;
            background: #f0f4f8;
            padding: 30px;
            color: #1a202c;
            line-height: 1.7;
        }

        .letter-page {
            max-width: 800px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 0;
            box-shadow: 0 15px 50px rgba(0, 34, 68, 0.12);
            overflow: hidden;
            position: relative;
        }

        .letter-page::before {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 8px;
            background: linear-gradient(90deg, #003366, #FFD700, #ffffff, #FFD700, #003366);
        }

        .letterhead {
            padding: 40px 50px 25px;
            text-align: center;
            border-bottom: 3px solid #003366;
            position: relative;
            background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
        }

        .letterhead::after {
            content: "";
            position: absolute;
            bottom: -6px;
            left: 0;
            right: 0;
            height: 3px;
            background: #FFD700;
        }

        .letterhead .logo-area {
            margin-bottom: 12px;
        }

        .letterhead .logo-area img {
            border-radius: 50%;
            border: 3px solid #FFD700;
            box-shadow: 0 4px 15px rgba(0, 51, 102, 0.15);
        }

        .school-name {
            font-family: 'Playfair Display', serif;
            font-size: 28px;
            font-weight: 800;
            color: #003366;
            letter-spacing: 3px;
            text-transform: uppercase;
            margin-bottom: 4px;
        }

        .department {
            font-size: 13px;
            font-weight: 600;
            color: #FFD700;
            background: #003366;
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            letter-spacing: 2px;
            text-transform: uppercase;
            margin-bottom: 8px;
        }

        .contact-info {
            font-size: 12px;
            color: #5a6f85;
            line-height: 1.5;
        }

        .contact-info span {
            color: #FFD700;
            margin: 0 6px;
            font-weight: 700;
        }

        .letter-body {
            padding: 35px 50px 40px;
        }

        .date-line {
            text-align: right;
            font-size: 14px;
            color: #003366;
            font-weight: 600;
            margin-bottom: 25px;
        }

        .recipient {
            font-size: 14px;
            font-weight: 600;
            color: #333;
            margin-bottom: 25px;
        }

        .subject-line {
            text-align: center;
            font-size: 15px;
            font-weight: 700;
            color: #003366;
            text-transform: uppercase;
            letter-spacing: 1px;
            border-top: 2px solid #FFD700;
            border-bottom: 2px solid #FFD700;
            padding: 12px 20px;
            margin-bottom: 25px;
            background: linear-gradient(135deg, #f8fbff, #eef4fb);
        }

        .letter-text {
            font-size: 14px;
            color: #2d3748;
            text-align: justify;
            margin-bottom: 16px;
        }

        .letter-text strong {
            color: #003366;
        }

        .signature-section {
            margin-top: 35px;
        }

        .sign-block {
            margin-bottom: 30px;
        }

        .sign-block .sign-label {
            font-size: 12px;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 4px;
        }

        .sign-line {
            width: 250px;
            border-bottom: 2px dotted #003366;
            height: 45px;
            margin-bottom: 6px;
        }

        .sign-name {
            font-weight: 700;
            color: #003366;
            font-size: 14px;
        }

        .sign-title {
            font-size: 12px;
            color: #5a6f85;
            font-style: italic;
        }

        .receiving-section {
            margin-top: 45px;
            padding: 25px;
            border: 2px dashed #003366;
            border-radius: 8px;
            background: #f8fafd;
        }

        .receiving-section h4 {
            color: #003366;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 20px;
            text-align: center;
        }

        .receiving-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }

        .receiving-field {
            display: flex;
            flex-direction: column;
        }

        .receiving-field .field-label {
            font-size: 11px;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 4px;
        }

        .receiving-field .field-line {
            border-bottom: 1.5px solid #003366;
            height: 30px;
        }

        .receiving-field.full-width {
            grid-column: 1 / -1;
        }

        .stamp-area {
            grid-column: 1 / -1;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-top: 15px;
        }

        .stamp-box {
            width: 150px;
            height: 100px;
            border: 2px dashed #ccc;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            color: #aaa;
            text-transform: uppercase;
        }

        .letter-footer {
            background: #003366;
            color: white;
            text-align: center;
            padding: 15px 50px;
            font-size: 12px;
            position: relative;
        }

        .letter-footer::before {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: #FFD700;
        }

        .letter-footer span {
            color: #FFD700;
            font-weight: 600;
        }

        .print-btn {
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #003366, #004488);
            color: #FFD700;
            border: none;
            padding: 14px 28px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 700;
            font-size: 15px;
            box-shadow: 0 6px 20px rgba(0, 51, 102, 0.25);
            z-index: 100;
            font-family: 'Outfit', sans-serif;
            transition: all 0.3s;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .print-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 10px 30px rgba(0, 51, 102, 0.35);
        }

        @media print {
            .print-btn { display: none; }
            body { padding: 0; background: white; }
            .letter-page { box-shadow: none; max-width: 100%; }
        }

        @media (max-width: 600px) {
            body { padding: 10px; }
            .letterhead, .letter-body { padding-left: 25px; padding-right: 25px; }
            .school-name { font-size: 20px; letter-spacing: 1px; }
            .receiving-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <button class="print-btn" onclick="window.print()">&#128424; Print / Save as PDF</button>

    <div class="letter-page">
        <!-- Letterhead -->
        <div class="letterhead">
            <div class="logo-area">
                ${logoHtml}
            </div>
            <div class="school-name">General Fashion Academy</div>
            <div class="department">Department of Vocational &amp; Technical Studies / Fashion Department</div>
            <div class="contact-info">
                Accra, Ghana
                <span>|</span>
                +233 24 426 4872 / +233 54 344 3983
                <span>|</span>
                generalfashionacademyaccra@gmail.com
            </div>
        </div>

        <!-- Letter Body -->
        <div class="letter-body">
            <div class="date-line">${escapeHtml(dateStr)}</div>

            <div class="recipient">
                To Whom It May Concern,
            </div>

            <div class="subject-line">
                SUBJECT: INTRODUCTORY LETTER FOR INDUSTRIAL INTERNSHIP ATTACHMENT
            </div>

            <p class="letter-text">
                This letter serves to formally introduce and recommend our student, <strong>${escapeHtml(fullName)}</strong>, who is currently a student in our fashion design program specializing in garment construction, textiles, and fashion technologies.
            </p>

            <p class="letter-text">
                As part of our curriculum requirements and commitment to producing industry-ready graduates, students are required to undergo a hands-on internship program. This attachment is designed to give them practical exposure to the professional fashion industry, allowing them to apply their classroom knowledge to real-world design, material sourcing, and production processes.
            </p>

            <p class="letter-text">
                <strong>${escapeHtml(fullName)}</strong> has proven to be an exceptionally resourceful, hardworking, and forward-thinking student. ${pronoun} possesses a strong foundational knowledge of pattern making, digital design tools, and trend analysis. Beyond ${possessive} technical skills, ${pronounLower} has demonstrated a keen interest in the operational side of fashion, particularly in solving real-world challenges related to material sourcing and marketplace accessibility for local designers.
            </p>

            <p class="letter-text">
                We would be highly grateful if you could grant ${objectPronoun} the opportunity to intern with your organization for a period of <strong>4 to 8 weeks</strong>, starting from <strong>the upcoming academic session</strong>. We are confident that ${possessive} strong work ethic, technical skills, and creative problem-solving mindset will make ${objectPronoun} a valuable asset to your team during ${possessive} attachment.
            </p>

            <p class="letter-text">
                Please find attached ${possessive} academic profile and portfolio for your review. If your organization requires any further documentation or has specific onboarding guidelines, please do not hesitate to contact the department.
            </p>

            <p class="letter-text">
                Thank you for your cooperation and commitment to nurturing the next generation of fashion professionals.
            </p>

            <!-- School Signature -->
            <div class="signature-section">
                <p style="margin-bottom: 5px; font-size: 14px; color: #2d3748;">Yours faithfully,</p>
                <div class="sign-block">
                    <div class="sign-label">Signature</div>
                    <div class="sign-line"></div>
                    <div class="sign-name">Head of Department / Principal</div>
                    <div class="sign-title">Head of Department / School Administration</div>
                    <div class="sign-title">General Fashion Academy</div>
                </div>
            </div>

            <!-- Receiving Organization Section -->
            <div class="receiving-section">
                <h4>&#9997; For the Receiving Organization / Shop Owner</h4>
                <div class="receiving-grid">
                    <div class="receiving-field">
                        <div class="field-label">Name of Organization / Shop</div>
                        <div class="field-line"></div>
                    </div>
                    <div class="receiving-field">
                        <div class="field-label">Contact Person / Shop Owner Name</div>
                        <div class="field-line"></div>
                    </div>
                    <div class="receiving-field">
                        <div class="field-label">Phone Number</div>
                        <div class="field-line"></div>
                    </div>
                    <div class="receiving-field">
                        <div class="field-label">Date of Acceptance</div>
                        <div class="field-line"></div>
                    </div>
                    <div class="receiving-field full-width">
                        <div class="field-label">Address of Organization</div>
                        <div class="field-line"></div>
                    </div>
                    <div class="stamp-area">
                        <div>
                            <div class="field-label" style="font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">Signature of Shop Owner</div>
                            <div class="sign-line" style="width: 200px;"></div>
                        </div>
                        <div class="stamp-box">
                            Company Stamp / Seal
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Footer -->
        <div class="letter-footer">
            <span>General Fashion Academy</span> &mdash; Training Tomorrow's Fashion Leaders Today
        </div>
    </div>
</body>
</html>`;

    const blob = new Blob([letterHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = fullName.replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, "_");
    a.download = `GFA_Introductory_Letter_${safeName}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
