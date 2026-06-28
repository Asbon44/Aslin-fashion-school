// Admission Forms Admin Logic

let currentAccraFormId = null;
let allAccraForms = [];

window.initAccraAdmin = () => {
    const db = firebase.database();
    db.ref('accra_forms').on('value', snap => {
        const data = snap.val();
        if (data) {
            allAccraForms = Object.entries(data).map(([id, val]) => ({ id, ...val }));
            allAccraForms.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
        } else {
            allAccraForms = [];
        }
        filterAccraForms(); // Initial render with current search query if any
    });
};

window.renderAccraForms = (entries) => {
    const list = document.getElementById('admin-accra-forms-list');
    if (!list) return;
    list.innerHTML = '';
    
    if (entries.length > 0) {
        entries.forEach(form => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${form.surname || ''}, ${form.firstname || ''}</strong></td>
                <td>${form.admission_batch || 'N/A'}</td>
                <td>${form.preferred_branch || 'N/A'}</td>
                <td><small>${form.serial || 'N/A'}</small></td>
                <td>${new Date(form.submittedAt).toLocaleDateString()}</td>
                <td>
                    <button class="small-btn primary-btn" onclick="viewAccraFormDetails('${form.id}')" style="margin-right:5px;"><i class="fas fa-eye"></i> View</button>
                    <button class="small-btn" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:4px;" onclick="deleteAccraForm('${form.id}')"><i class="fas fa-trash"></i></button>
                </td>
            `;
            list.appendChild(tr);
        });
    } else {
        list.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No submitted forms found.</td></tr>';
    }
};

window.filterAccraForms = () => {
    const searchInput = document.getElementById('admin-accra-search');
    const query = searchInput ? searchInput.value.toLowerCase() : '';
    
    const filtered = allAccraForms.filter(f => 
        (f.surname || '').toLowerCase().includes(query) || 
        (f.firstname || '').toLowerCase().includes(query) || 
        (f.serial || '').toLowerCase().includes(query) || 
        (f.admission_batch || '').toLowerCase().includes(query) ||
        (f.preferred_branch || '').toLowerCase().includes(query)
    );
    
    renderAccraForms(filtered);
};

window.viewAccraFormDetails = async (id) => {
    currentAccraFormId = id;
    const db = firebase.database();
    const snap = await db.ref('accra_forms/' + id).once('value');
    const form = snap.val();
    if (!form) return;

    const content = document.getElementById('accra-form-detail-content');
    
    let html = `
        <div class="print-section" style="padding: 20px; font-family: 'Inter', sans-serif;">
            <div style="text-align: center; border-bottom: 2px solid var(--primary-blue); padding-bottom: 15px; margin-bottom: 20px;">
                <img src="logo.jpg" style="width: 80px; margin-bottom: 10px;">
                <h1 style="color: var(--primary-blue); font-family: 'Playfair Display', serif; margin: 0; font-size: 1.8rem;">General Fashion Academy</h1>
                <p style="color: var(--accent-gold); font-weight: 700; margin: 5px 0; font-size: 0.9rem;">OFFICIAL ADMISSION APPLICATION</p>
            </div>

            <div style="display: flex; gap: 30px; margin-bottom: 25px; align-items: start;">
                <div style="width: 150px; height: 180px; border: 2px solid #e1e8ed; border-radius: 8px; overflow: hidden; background: #f8fafc; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    ${form._passportDataUrl ? `<img src="${form._passportDataUrl}" style="width: 100%; height: 100%; object-fit: cover;">` : `<span style="color: #a0aec0; font-size: 0.8rem; text-align: center;">No Image<br>Provided</span>`}
                </div>
                <div style="flex: 1;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 0.9rem;">
                        <div>
                            <p><strong>Serial:</strong> ${form.serial || 'N/A'}</p>
                            <p><strong>Batch:</strong> ${form.admission_batch || 'N/A'}</p>
                        </div>
                        <div style="text-align: right;">
                            <p><strong>Branch:</strong> ${form.preferred_branch || 'N/A'}</p>
                            <p><strong>Date:</strong> ${new Date(form.submittedAt).toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>

            <h3 style="background: #f1f5f9; padding: 8px 12px; border-radius: 4px; color: var(--primary-blue); margin-top: 20px; font-size: 1rem; border-left: 4px solid var(--accent-gold);">Section A: Applicant Particulars</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 10px; font-size: 0.85rem;">
                <p><strong>Surname:</strong> ${form.surname || 'N/A'}</p>
                <p><strong>First Name:</strong> ${form.firstname || 'N/A'}</p>
                <p><strong>Other Names:</strong> ${form.othernames || 'N/A'}</p>
                <p><strong>Gender:</strong> ${form.gender || 'N/A'}</p>
                <p><strong>Date of Birth:</strong> ${form.dob || 'N/A'}</p>
                <p><strong>Place of Birth:</strong> ${form.pob || 'N/A'}</p>
                <p><strong>Hometown/Region:</strong> ${form.hometown || 'N/A'}</p>
                <p><strong>Religion:</strong> ${form.religion || 'N/A'}</p>
                <p><strong>Residential Status:</strong> ${form.residential || 'N/A'}</p>
            </div>

            <h3 style="background: #f1f5f9; padding: 8px 12px; border-radius: 4px; color: var(--primary-blue); margin-top: 15px; font-size: 1rem; border-left: 4px solid var(--accent-gold);">Section B: Contact & Background</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 10px; font-size: 0.85rem;">
                <p><strong>Address:</strong> ${form.contact_address || 'N/A'}</p>
                <p><strong>Living Situation:</strong> ${form.living_situation || 'N/A'}</p>
                <p><strong>Marketing Source:</strong> ${form.marketing || 'N/A'}</p>
                <p><strong>First Time?</strong> ${form.first_time || 'N/A'}</p>
                ${form.first_time === 'No' ? `<p><strong>Prev School:</strong> ${form.previous_school || 'N/A'}</p>` : ''}
            </div>

            <h3 style="background: #f1f5f9; padding: 8px 12px; border-radius: 4px; color: var(--primary-blue); margin-top: 15px; font-size: 1rem; border-left: 4px solid var(--accent-gold);">Section C: Family Information</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 10px; font-size: 0.85rem;">
                <p><strong>Father's Name:</strong> ${form.father_name || 'N/A'}</p>
                <p><strong>Father's Job:</strong> ${form.father_job || 'N/A'}</p>
                <p><strong>Father's Phone:</strong> ${form.father_phone || 'N/A'}</p>
                <p><strong>Mother's Name:</strong> ${form.mother_name || 'N/A'}</p>
                <p><strong>Mother's Job:</strong> ${form.mother_job || 'N/A'}</p>
                <p><strong>Mother's Phone:</strong> ${form.mother_phone || 'N/A'}</p>
                <p><strong>Emergency Contact:</strong> ${form.emergency_name || 'N/A'}</p>
                <p><strong>Emergency Phone:</strong> ${form.emergency_phone || 'N/A'}</p>
            </div>

            <h3 style="background: #f1f5f9; padding: 8px 12px; border-radius: 4px; color: var(--primary-blue); margin-top: 15px; font-size: 1rem; border-left: 4px solid var(--accent-gold);">Section D: Medical Information</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 10px; font-size: 0.85rem;">
                <p><strong>Family Doctor:</strong> ${form.doctor_name || 'N/A'}</p>
                <p><strong>Doctor's Phone:</strong> ${form.doctor_phone || 'N/A'}</p>
                <p><strong>Asthma Status:</strong> ${form.asthma || 'N/A'}</p>
                <p><strong>NHIS Active?</strong> ${form.nhis || 'N/A'}</p>
                <p><strong>NHIS Number:</strong> ${form.nhis_number || 'N/A'}</p>
                <p><strong>Other Medical Needs:</strong> ${form.other_needs || 'None'}</p>
            </div>
        </div>
    `;
    
    content.innerHTML = html;
    openModal('accra-form-detail-modal');
};

window.printAccraForm = () => {
    const printContents = document.getElementById('accra-form-detail-content').innerHTML;
    const originalContents = document.body.innerHTML;
    document.body.innerHTML = printContents;
    window.print();
    document.body.innerHTML = originalContents;
    window.location.reload();
};

window.deleteAccraForm = async (id = currentAccraFormId) => {
    if (!id) return;
    if (confirm("Are you sure you want to delete this admission form?")) {
        const db = firebase.database();
        await db.ref('accra_forms/' + id).remove();
        closeModal('accra-form-detail-modal');
    }
};

window.loadAccraForms = () => {
    alert("Refreshing Admission forms...");
};
