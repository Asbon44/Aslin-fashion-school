// ===================================================================
// ADMINISTRATOR.JS — Full Admin Dashboard Logic
// Mirrors all functionality from app.js admin section
// ===================================================================

// Firebase Configuration
const firebaseConfig = {
    databaseURL: "https://gfa-admission-forms-default-rtdb.firebaseio.com/",
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// ---- State ----
let adminLoggedIn = false;
let currentUser = { type: 'admin' };
let currentLevelFilter = 'all';
let currentViewedStudentId = null;

// ===================================================================
// DOMContentLoaded — init everything
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {

    // ---- Login ----
    const loginForm = document.getElementById('form-admin-auth');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const pwd = document.getElementById('auth-password').value.trim();
            const errDiv = document.getElementById('auth-error');
            if (pwd === 'Linda123') {
                adminLoggedIn = true;
                document.getElementById('login-screen').style.display = 'none';
                document.getElementById('admin-portal').style.display = 'block';
                loadAdminData();
                if (window.initAccraAdmin) window.initAccraAdmin();
            } else {
                errDiv.textContent = 'Incorrect password. Please try again.';
                errDiv.style.display = 'block';
            }
        });
    }

    // ---- Sidebar Navigation (data-admin-tab) ----
    document.addEventListener('click', (e) => {
        const navItem = e.target.closest('li[data-admin-tab]');
        if (!navItem) return;

        const tabName = navItem.getAttribute('data-admin-tab');

        // Update active state on sidebar items
        navItem.parentElement.querySelectorAll('li[data-admin-tab]').forEach(li => li.classList.remove('active'));
        navItem.classList.add('active');

        // Show target tab, hide others
        document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.remove('active'));
        const target = document.getElementById(`admin-${tabName}-tab`);
        if (target) target.classList.add('active');
    });

    // ---- Lightbox ----
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

    // ---- Add Student Form ----
    const addStudentForm = document.getElementById('form-add-student');
    if (addStudentForm) {
        addStudentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!adminLoggedIn) return;

            const name = document.getElementById('add-st-name').value.trim();
            const email = document.getElementById('add-st-email').value.trim();
            const phone = document.getElementById('add-st-phone').value.trim();
            const password = document.getElementById('add-st-password').value.trim();
            const course = document.getElementById('add-st-course').value;
            const boarding = document.getElementById('add-st-boarding').checked;

            const nameParts = name.split(' ');
            const firstName = nameParts[0] || '';
            const surname = nameParts.slice(1).join(' ') || '';

            try {
                const newRef = db.ref('students').push();
                const studentNumber = 'GFA-' + Math.floor(100000 + Math.random() * 900000);
                await newRef.set({
                    name,
                    firstName,
                    surname,
                    email,
                    phone,
                    password,
                    course,
                    boarding,
                    studentNumber,
                    level: '100',
                    courseStatus: 'Not Assigned',
                    attendance: 0,
                    registeredAt: new Date().toISOString()
                });
                alert('Student registered successfully! Student ID: ' + studentNumber);
                addStudentForm.reset();
                closeModal('add-student-modal');
                loadAdminData();
            } catch (err) {
                alert('Error registering student: ' + err.message);
            }
        });
    }

    // ---- Add Payment Form ----
    const addPaymentForm = document.getElementById('form-add-payment');
    if (addPaymentForm) {
        addPaymentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!adminLoggedIn) return;

            const studentId = document.getElementById('pay-st-id').value;
            const type = document.getElementById('pay-type').value;
            const amount = document.getElementById('pay-amount').value;
            const method = document.getElementById('pay-method').value;
            const date = document.getElementById('pay-date').value;

            if (!studentId) { alert('Please select a student.'); return; }

            try {
                const stSnap = await db.ref('students/' + studentId).once('value');
                const stData = stSnap.val();

                const payRef = db.ref('payments').push();
                const payId = payRef.key;
                const receiptNum = '#GFA-' + Math.floor(1000 + Math.random() * 9000);

                await payRef.set({ studentId, type, amount: parseFloat(amount), method, date, createdAt: new Date().toISOString() });

                // Show Receipt
                document.getElementById('rec-no').textContent = receiptNum;
                document.getElementById('rec-date').textContent = date;
                document.getElementById('rec-student').textContent = stData ? stData.name : 'Unknown';
                document.getElementById('rec-method').textContent = method;
                document.getElementById('rec-amount').textContent = 'GHC ' + parseFloat(amount).toFixed(2);

                addPaymentForm.reset();
                closeModal('add-payment-modal');
                openModal('receipt-modal');
            } catch (err) {
                alert('Error saving payment: ' + err.message);
            }
        });
    }

    // ---- Announcement Form ----
    const annForm = document.getElementById('form-add-announcement');
    if (annForm) {
        annForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!adminLoggedIn) return;

            const title = document.getElementById('ann-title').value.trim();
            const message = document.getElementById('ann-message').value.trim();
            const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

            try {
                await db.ref('announcements').push({ title, message, date, createdAt: new Date().toISOString() });
                alert('Announcement posted successfully to all student portals!');
                annForm.reset();
            } catch (err) {
                alert('Error posting announcement: ' + err.message);
            }
        });
    }
});

// ===================================================================
// loadAdminData — master data loader (real-time listeners)
// ===================================================================
window.loadAdminData = () => {
    if (!adminLoggedIn) return;

    // Students
    db.ref('students').on('value', snap => {
        const list = document.getElementById('admin-students-list');
        const select = document.getElementById('pay-st-id');
        if (!list) return;
        list.innerHTML = '';
        if (select) select.innerHTML = '<option value="">Select Student...</option>';

        let total = 0, boarding = 0, day = 0, level100 = 0, level200 = 0;
        const data = snap.val();

        const searchInput = document.getElementById('admin-student-search');
        const query = searchInput ? searchInput.value.toLowerCase() : '';

        for (let id in data) {
            const student = data[id];
            total++;
            if (student.boarding) boarding++; else day++;
            if (student.level === '100') level100++;
            else if (student.level === '200') level200++;

            if (currentLevelFilter !== 'all' && student.level !== currentLevelFilter) continue;

            const nameMatch = (student.name || '').toLowerCase().includes(query);
            const idMatch = (student.studentNumber || '').toLowerCase().includes(query);
            if (query && !nameMatch && !idMatch) continue;

            const courseDisplay = student.courseStatus === 'Assigned'
                ? student.course
                : '<span style="color:#f1c40f; font-weight:600;">Not Assigned</span>';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${student.studentNumber || 'N/A'}</strong></td>
                <td>${student.name}</td>
                <td>${courseDisplay}</td>
                <td>Level ${student.level || 'N/A'}</td>
                <td>${student.boarding ? 'Boarder' : 'Day Student'}</td>
                <td>
                    <button class="primary-btn small-btn" style="margin-right:5px;" onclick="viewStudentDetails('${id}')"><i class="fas fa-eye"></i> View</button>
                    <button class="danger-btn" onclick="deleteStudent('${id}')"><i class="fas fa-trash"></i> Delete</button>
                </td>`;
            list.appendChild(tr);

            if (select) {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = student.name;
                select.appendChild(opt);
            }
        }

        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setEl('stat-total-students', total);
        setEl('stat-boarding', boarding);
        setEl('stat-day', day);
        setEl('stat-level-100', level100);
        setEl('stat-level-200', level200);

        // Filter indicator
        const indicator = document.getElementById('admin-filter-indicator');
        const clearBtn = document.getElementById('btn-clear-filter');
        if (indicator && clearBtn) {
            const queryText = query ? ` and matching "${query}"` : '';
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

    // Payments
    db.ref('payments').on('value', async snap => {
        const list = document.getElementById('admin-payments-list');
        const dateInput = document.getElementById('admin-payment-date-search');
        const totalBox = document.getElementById('stat-payment-total');
        if (!list) return;
        list.innerHTML = '';

        const filterDate = dateInput ? dateInput.value : '';
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
            tr.innerHTML = `<td>${name}</td><td>${p.type || 'Fees'}</td><td style="font-weight:700;color:var(--accent-gold);">GHC ${parseFloat(p.amount).toFixed(2)}</td><td>${p.date}</td><td>${p.method}</td>
            <td>
                <a href="mailto:${stData[p.studentId]?.email}?subject=Payment Receipt&body=Received GHC ${p.amount} for ${p.type || 'Fees'}" class="primary-btn small-btn" style="text-decoration:none;margin-right:5px;"><i class="fas fa-paper-plane"></i></a>
                <button class="danger-btn" onclick="deletePayment('${id}')"><i class="fas fa-trash"></i></button>
            </td>`;
            list.appendChild(tr);
        }
        if (totalBox) totalBox.textContent = `GHC ${totalSum.toFixed(2)}`;
    });

    // Announcements
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
                        <button class="danger-btn" onclick="deleteAnnouncement('${id}')"><i class="fas fa-trash"></i> Delete</button>
                    </div>
                    <p style="font-size:0.9rem;margin-top:8px;">${ann.message}</p>
                    <small class="text-muted">${ann.date}</small>
                `;
                list.appendChild(div);
            }
        } else {
            list.innerHTML = '<p class="text-muted">No announcements found.</p>';
        }
    });

    // Complaints
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
                        <button class="danger-btn" onclick="deleteComplaint('${id}')">Archive</button>
                    </div>
                    <p style="margin:10px 0;font-size:0.95rem;">${comp.message}</p>
                    <div class="flex-between" style="font-size:0.8rem;color:#666;">
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

    // Class Rep Reports
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
                        <button class="danger-btn" onclick="deleteClassrepReport('${id}')">Archive</button>
                    </div>
                    <p style="margin:10px 0;font-size:0.95rem;">${rep.message}</p>
                    <div class="flex-between" style="font-size:0.8rem;color:#666;">
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

    // Attendance Snapshots
    db.ref('attendance_snapshots').on('value', snap => {
        const grid = document.getElementById('admin-attendance-snapshots-list');
        if (!grid) return;
        grid.innerHTML = '';
        const data = snap.val();
        if (data) {
            const sorted = Object.entries(data).sort((a, b) => new Date(b[1].timestamp) - new Date(a[1].timestamp));
            sorted.forEach(([id, s]) => {
                const card = document.createElement('div');
                card.className = 'course-category-card glass-card';
                card.style.padding = '1.5rem';
                card.innerHTML = `
                    <div style="font-size:0.8rem;color:#666;margin-bottom:5px;">Level ${s.level} • ${s.day}</div>
                    <h3 style="margin-bottom:10px;color:var(--primary-blue);"><i class="fas fa-calendar-check"></i> ${new Date(s.date).toLocaleDateString()}</h3>
                    <div style="font-size:0.85rem;margin-bottom:15px;">
                        <span class="status-pill present">${s.records.length} Students marked</span>
                    </div>
                    <div style="display:flex;gap:5px;">
                        <button class="primary-btn small-btn" style="flex:1;padding:6px;" onclick="viewAdminSnapshot('${id}')">View List</button>
                        <button class="danger-btn" style="flex:1;padding:6px;" onclick="deleteAttendanceSnapshot('${id}')"><i class="fas fa-trash"></i> Delete</button>
                    </div>
                `;
                grid.appendChild(card);
            });
        } else {
            grid.innerHTML = '<p class="text-muted">No saved registers found.</p>';
        }
    });

    // Hostel Bookings
    db.ref('hostel_bookings').on('value', async snap => {
        const list = document.getElementById('admin-hostel-list');
        const totalBox = document.getElementById('admin-hostel-total');
        if (!list) return;
        list.innerHTML = '';

        const data = snap.val();
        let count = 0;

        if (data) {
            // Build occupancy grid
            const occupancyGrid = document.getElementById('admin-hostel-occupancy-grid');
            if (occupancyGrid) {
                const roomMap = {};
                for (let id in data) {
                    const b = data[id];
                    if (!roomMap[b.hostel]) roomMap[b.hostel] = {};
                    if (!roomMap[b.hostel][b.room]) roomMap[b.hostel][b.room] = [];
                    roomMap[b.hostel][b.room].push(b.studentName);
                }
                occupancyGrid.innerHTML = '';
                for (let hostel in roomMap) {
                    for (let room in roomMap[hostel]) {
                        const students = roomMap[hostel][room];
                        const card = document.createElement('div');
                        card.className = 'glass-card';
                        card.style.padding = '15px';
                        card.style.cursor = 'pointer';
                        card.innerHTML = `
                            <div style="font-weight:700;color:var(--primary-blue);font-size:0.85rem;">${hostel}</div>
                            <div style="font-size:1.1rem;font-weight:800;margin:5px 0;">${room}</div>
                            <div style="font-size:0.75rem;color:#64748b;">${students.length} student(s)</div>
                            <div style="margin-top:8px;font-size:0.8rem;color:#555;">${students.slice(0,3).join(', ')}${students.length > 3 ? '...' : ''}</div>
                        `;
                        occupancyGrid.appendChild(card);
                    }
                }
            }

            for (let id in data) {
                count++;
                const b = data[id];
                const tr = document.createElement('tr');
                const statusPill = b.status === 'Approved'
                    ? '<span class="status-pill present">Approved</span>'
                    : '<span class="status-pill warning">Pending</span>';
                const actionButtons = b.status === 'Pending'
                    ? `<button class="success-btn" style="margin-right:5px;" onclick="approveHostelBooking('${id}')"><i class="fas fa-check"></i> Accept</button>` : '';

                tr.innerHTML = `
                    <td>${b.studentName}</td>
                    <td><strong>${b.studentNumber || 'N/A'}</strong></td>
                    <td>${b.hostel}</td>
                    <td>${b.room}</td>
                    <td>${statusPill}</td>
                    <td>
                        ${actionButtons}
                        <button class="danger-btn" onclick="deleteHostelBooking('${id}')">Cancel/Remove</button>
                    </td>`;
                list.appendChild(tr);
            }
        }
        if (totalBox) totalBox.textContent = count;
        if (count === 0) {
            list.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hostel bookings found.</td></tr>';
        }
    });

    // Shop Attachments
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
                        <div style="font-size:0.8rem;color:#666;">${att.studentEmail}</div>
                    </td>
                    <td>${att.shopName}</td>
                    <td>${att.town}, ${att.region}</td>
                    <td>${att.ownerPhone}</td>
                    <td>${new Date(att.createdAt).toLocaleDateString()}</td>
                    <td>
                        <button class="primary-btn small-btn" style="margin-right:5px;" onclick="viewAttachmentDetails('${id}')"><i class="fas fa-eye"></i></button>
                        <button class="danger-btn" onclick="deleteAttachment('${id}')"><i class="fas fa-trash"></i></button>
                    </td>`;
                list.appendChild(tr);
            }
        } else {
            list.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No attachments found.</td></tr>';
        }
    });

    // Admission Forms (Accra)
    if (window.initAccraAdmin) window.initAccraAdmin();
};

// ===================================================================
// Tab Navigation Helper
// ===================================================================
window.switchAdminTab = (tabId) => {
    document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[data-admin-tab]').forEach(t => t.classList.remove('active'));
    const target = document.getElementById(`admin-${tabId}-tab`);
    const link = document.querySelector(`[data-admin-tab="${tabId}"]`);
    if (target) target.classList.add('active');
    if (link) link.classList.add('active');
};

// ===================================================================
// Modal Helpers
// ===================================================================
window.openModal = id => { const m = document.getElementById(id); if (m) m.classList.add('active'); };
window.closeModal = id => { const m = document.getElementById(id); if (m) m.classList.remove('active'); };

// ===================================================================
// Student Actions
// ===================================================================
window.filterStudents = (level) => {
    currentLevelFilter = level;
    loadAdminData();
};

window.deleteStudent = (id) => {
    if (confirm('Are you sure you want to permanently delete this student?')) {
        db.ref('students/' + id).remove().then(() => alert('Student deleted.')).catch(err => alert(err.message));
    }
};

window.viewStudentDetails = async (id) => {
    try {
        const snap = await db.ref('students/' + id).once('value');
        const st = snap.val();
        if (!st) return;

        document.getElementById('det-st-name').textContent = st.name;
        document.getElementById('det-st-id').textContent = st.studentNumber || 'N/A';
        document.getElementById('det-st-email').textContent = st.email || '—';
        document.getElementById('det-st-phone').textContent = st.phone || '—';
        document.getElementById('det-st-gender').textContent = st.gender || 'Not specified';
        document.getElementById('det-st-level').textContent = `Level ${st.level || 'N/A'}`;
        document.getElementById('det-st-boarding').textContent = st.boarding ? 'Boarder' : 'Day Student';
        document.getElementById('det-st-course').textContent = st.course || 'Not Assigned';
        document.getElementById('det-st-reg-date').textContent = st.registeredAt ? new Date(st.registeredAt).toLocaleDateString() : 'N/A';

        const pic = document.getElementById('det-st-pic');
        if (st.passportPic) { pic.src = st.passportPic; pic.style.display = 'block'; }
        else { pic.style.display = 'none'; }

        const hostelSnap = await db.ref('hostel_bookings').orderByChild('studentId').equalTo(id).once('value');
        const bookings = hostelSnap.val();
        const roomBox = document.getElementById('det-st-room');
        if (bookings) { const b = Object.values(bookings)[0]; roomBox.textContent = `${b.hostel} - Room ${b.room}`; }
        else { roomBox.textContent = 'Not Booked'; }

        const paySnap = await db.ref('payments').orderByChild('studentId').equalTo(id).once('value');
        const payments = paySnap.val();
        const payList = document.getElementById('det-st-payments-list');
        payList.innerHTML = '';

        if (payments) {
            Object.values(payments).sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${p.type || 'Fees'}</td><td style="font-weight:700;color:var(--accent-gold);">GHC ${parseFloat(p.amount).toFixed(2)}</td><td>${p.method}</td><td>${p.date}</td>`;
                payList.appendChild(tr);
            });
        } else {
            payList.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No payment records found.</td></tr>';
        }

        currentViewedStudentId = id;
        loadStudentHistoryUI(id);
        openModal('student-detail-modal');
    } catch (err) {
        console.error(err);
        alert('Error loading student details: ' + err.message);
    }
};

// ===================================================================
// Student History
// ===================================================================
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
        alert('History entry added successfully!');
    } catch (err) {
        alert('Failed to save history entry.');
    }
};

window.deleteStudentHistory = async (historyId) => {
    if (!currentViewedStudentId) return;
    if (confirm('Delete this history entry?')) {
        await db.ref(`students/${currentViewedStudentId}/history/${historyId}`).remove();
        loadStudentHistoryUI(currentViewedStudentId);
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
                <div style="flex:1;padding-right:15px;">
                    <p style="font-size:0.95rem;margin-bottom:5px;color:#2d3748;">${h.text}</p>
                    <small style="color:#a0aec0;font-size:0.8rem;">${h.date}</small>
                </div>
                <button class="danger-btn" onclick="deleteStudentHistory('${id}')"><i class="fas fa-trash"></i></button>
            `;
            list.appendChild(div);
        });
    } else {
        list.innerHTML = '<p class="text-muted text-center">No history recorded yet.</p>';
    }
}

window.viewFullHistory = (text, date) => {
    document.getElementById('hist-modal-date').textContent = date;
    document.getElementById('hist-modal-text').textContent = text;
    openModal('history-detail-modal');
};

// ===================================================================
// Payments
// ===================================================================
window.deletePayment = id => {
    if (confirm('Delete this payment record?')) {
        db.ref('payments/' + id).remove().catch(err => alert(err.message));
    }
};

// ===================================================================
// Announcements
// ===================================================================
window.deleteAnnouncement = async (id) => {
    if (confirm('Delete this announcement?')) {
        await db.ref('announcements/' + id).remove();
    }
};

// ===================================================================
// Complaints & Class Rep
// ===================================================================
window.deleteComplaint = async (id) => {
    if (confirm('Archive this complaint?')) {
        await db.ref('complaints/' + id).remove();
    }
};

window.deleteClassrepReport = async (id) => {
    if (confirm('Archive this report?')) {
        await db.ref('classrep_reports/' + id).remove();
    }
};

// ===================================================================
// Hostel Actions
// ===================================================================
window.approveHostelBooking = async (studentId) => {
    try {
        await db.ref('hostel_bookings').child(studentId).update({ status: 'Approved' });
        alert('Booking approved successfully!');
    } catch (e) { alert('Failed to approve booking.'); }
};

window.deleteHostelBooking = async (studentId) => {
    if (confirm('Remove this hostel booking?')) {
        await db.ref('hostel_bookings').child(studentId).remove();
    }
};

// ===================================================================
// Attendance Snapshots
// ===================================================================
window.viewAdminSnapshot = async (id) => {
    const snap = await db.ref('attendance_snapshots/' + id).once('value');
    const s = snap.val();
    if (!s) return;

    document.getElementById('adm-snap-title').textContent = `${s.day}, ${new Date(s.date).toLocaleDateString()}`;
    document.getElementById('adm-snap-meta').textContent = `Level ${s.level} • Saved at ${new Date(s.timestamp).toLocaleTimeString()}`;

    const list = document.getElementById('adm-snap-list');
    list.innerHTML = '';

    s.records.forEach(r => {
        let statusHtml = '<span class="status-pill" style="color:#888;">Not Marked</span>';
        if (r.status === 'Present') statusHtml = '<span class="status-pill present"><i class="fas fa-check-circle"></i> Present</span>';
        else if (r.status === 'Absent') statusHtml = '<span class="status-pill absent"><i class="fas fa-times-circle"></i> Absent</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong>${r.studentNumber || 'N/A'}</strong></td><td>${r.name}</td><td>${statusHtml}</td>`;
        list.appendChild(tr);
    });

    openModal('admin-attendance-detail-modal');
};

window.deleteAttendanceSnapshot = async (id) => {
    if (confirm('DANGER: Permanently delete this attendance register? This cannot be undone.')) {
        await db.ref('attendance_snapshots/' + id).remove();
        alert('Session register deleted.');
    }
};

// ===================================================================
// Attachments
// ===================================================================
window.viewAttachmentDetails = async (id) => {
    const snap = await db.ref('attachments/' + id).once('value');
    const att = snap.val();
    if (att) {
        alert(`Attachment Details:\n\nStudent: ${att.studentName}\nShop: ${att.shopName}\nTown: ${att.town}\nRegion: ${att.region}\nDistrict: ${att.district}\nAddress: ${att.shopAddress}\nOwner Phone: ${att.ownerPhone}`);
    }
};

window.deleteAttachment = async (id) => {
    if (confirm('Delete this attachment record?')) {
        const snap = await db.ref('attachments/' + id).once('value');
        const att = snap.val();
        if (att && att.studentId) {
            await db.ref('students/' + att.studentId).update({ attachmentSubmitted: false });
        }
        await db.ref('attachments/' + id).remove();
    }
};

// ===================================================================
// Student Report / Download
// ===================================================================
window.downloadStudentData = async () => {
    if (!currentViewedStudentId) return;

    try {
        const studentSnap = await db.ref(`students/${currentViewedStudentId}`).once('value');
        const student = studentSnap.val();
        if (!student) throw new Error('Student data not found');

        document.getElementById('rep-id-display').textContent = 'GFA-' + Math.floor(Math.random() * 1000000);
        document.getElementById('rep-date-display').textContent = new Date().toLocaleDateString();
        document.getElementById('rep-name').textContent = student.fullname || student.name || 'N/A';
        document.getElementById('rep-sid').textContent = student.studentNumber || currentViewedStudentId;
        document.getElementById('rep-level').textContent = student.currentLevel || `Level ${student.level || '1'}`;
        document.getElementById('rep-gender').textContent = student.gender || 'N/A';
        document.getElementById('rep-boarding').textContent = student.boarding ? 'Boarder' : 'Day Student';
        document.getElementById('rep-email').textContent = student.email || 'N/A';
        document.getElementById('rep-phone').textContent = student.phone || 'N/A';
        document.getElementById('rep-pic').src = student.passportPic || student.profilePic || 'logo.jpg';

        // Payments
        const payList = document.getElementById('rep-payments-list');
        payList.innerHTML = '';
        const paySnap = await db.ref('payments').orderByChild('studentId').equalTo(currentViewedStudentId).once('value');
        const pays = paySnap.val();
        if (pays) {
            Object.values(pays).forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td style="padding:10px;border-bottom:1px solid #eee;">${p.date}</td><td style="padding:10px;border-bottom:1px solid #eee;">${p.type}</td><td style="padding:10px;border-bottom:1px solid #eee;">${p.method}</td><td style="padding:10px;border-bottom:1px solid #eee;text-align:right;font-weight:700;">${p.amount}</td>`;
                payList.appendChild(tr);
            });
        } else {
            payList.innerHTML = '<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8;">No payment records found.</td></tr>';
        }

        // History
        const histList = document.getElementById('rep-history-list');
        histList.innerHTML = '';
        if (student.history) {
            Object.values(student.history).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).forEach(h => {
                const div = document.createElement('div');
                div.style.padding = '15px';
                div.style.borderBottom = '1px solid #edf2f7';
                div.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:5px;"><span style="font-weight:700;color:var(--primary-blue);font-size:0.9rem;">ACADEMIC NOTE</span><span style="font-size:0.8rem;color:#94a3b8;">${h.date}</span></div><p style="margin:0;font-size:0.95rem;color:#1e293b;line-height:1.5;">${h.text}</p>`;
                histList.appendChild(div);
            });
        } else {
            histList.innerHTML = '<p style="padding:20px;text-align:center;color:#94a3b8;">No academic history recorded.</p>';
        }

        // Hostel
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

        // Courses
        const courseList = document.getElementById('rep-courses-list');
        courseList.innerHTML = '';
        if (student.registeredCourses) {
            student.registeredCourses.forEach(c => {
                const span = document.createElement('span');
                span.style.cssText = 'background:#f1f5f9;padding:5px 12px;border-radius:20px;font-size:0.85rem;font-weight:600;color:#475569;border:1px solid #e2e8f0;';
                span.textContent = c;
                courseList.appendChild(span);
            });
        } else {
            courseList.innerHTML = '<p style="color:#94a3b8;font-style:italic;">No courses registered yet.</p>';
        }

        openModal('student-report-modal');
    } catch (err) {
        console.error(err);
        alert('Error generating report: ' + err.message);
    }
};

window.printReport = () => {
    const printContent = document.getElementById('printable-report').innerHTML;
    const printWindow = window.open('', '', 'height=1000,width=900');
    printWindow.document.write('<html><head><title>GFA Student Report</title>');
    printWindow.document.write('<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">');
    printWindow.document.write('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">');
    printWindow.document.write('<style>body{margin:0;padding:0;} :root{--primary-blue:#0A2540;--accent-gold:#D4AF37;}</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write(printContent);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.onload = function () { printWindow.print(); printWindow.close(); };
};

window.downloadAsImage = () => {
    if (typeof html2canvas === 'undefined') { alert('Image download not available. Please use Print instead.'); return; }
    const report = document.getElementById('printable-report');
    html2canvas(report, { scale: 2, useCORS: true, backgroundColor: '#ffffff' }).then(canvas => {
        const link = document.createElement('a');
        link.download = `GFA_Report_${document.getElementById('rep-name').textContent.replace(/\s+/g, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }).catch(() => alert('Failed to generate image. Please use Print instead.'));
};

// ===================================================================
// Logout
// ===================================================================
function logoutAdmin() {
    if (confirm('Are you sure you want to log out?')) {
        adminLoggedIn = false;
        document.getElementById('admin-portal').style.display = 'none';
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('auth-password').value = '';
        document.getElementById('auth-error').style.display = 'none';
    }
}
