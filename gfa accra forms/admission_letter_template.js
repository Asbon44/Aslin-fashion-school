// This file contains the updated downloadAdmissionLetter function
// matching the General_Fashion_Academy_Admission_Letter-v3 PDF

async function downloadAdmissionLetter() {
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
    const phone = studentData.father_phone || studentData.mother_phone || studentData.emergency_phone || "";
    const serial = (currentActiveRecord && currentActiveRecord.serial) || studentData['current-serial'] || "GFA/2025/0000";

    const batch = studentData.admission_batch || "";
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const logoDataUrl = await getLogoDataUrl();
    const logoHtml = logoDataUrl
        ? `<img src="${logoDataUrl}" alt="GFA Logo" style="width: 100px; height: 100px; object-fit: contain; border-radius: 50%; border: 3px solid #FFD700;" />`
        : `<div style="width: 100px; height: 100px; border-radius: 50%; background: linear-gradient(135deg, #003366, #FFD700); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 800; font-size: 24px;">GFA</div>`;

    const letterHtml = `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>GFA Admission Letter - ${escapeHtml(fullName)}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Outfit', sans-serif; background: #f0f4f8; padding: 30px; color: #1a202c; line-height: 1.7; }
        .letter-page { max-width: 800px; margin: 0 auto 40px; background: #fff; box-shadow: 0 15px 50px rgba(0,34,68,0.12); overflow: hidden; position: relative; }
        .letter-page::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 8px; background: linear-gradient(90deg, #003366, #FFD700, #fff, #FFD700, #003366); }
        .letterhead { padding: 40px 50px 20px; text-align: center; border-bottom: 3px solid #003366; background: linear-gradient(180deg, #f8fbff 0%, #fff 100%); position: relative; }
        .letterhead::after { content: ""; position: absolute; bottom: -6px; left: 0; right: 0; height: 3px; background: #FFD700; }
        .school-name { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 800; color: #003366; letter-spacing: 3px; text-transform: uppercase; margin: 10px 0 4px; }
        .sub-banner { display: inline-block; background: #003366; color: #FFD700; padding: 6px 30px; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; margin-top: 10px; border-radius: 2px; }
        .ref-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 30px; text-align: left; margin: 25px 0 10px; font-size: 13px; }
        .ref-grid .label { font-weight: 700; color: #003366; }
        .ref-grid .val { color: #2d3748; }
        .letter-body { padding: 30px 50px 40px; }
        .subject-line { text-align: center; font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 800; color: #003366; text-transform: uppercase; letter-spacing: 2px; border-bottom: 3px double #FFD700; padding-bottom: 10px; margin-bottom: 25px; }
        .to-block { background: #f8fbff; border-left: 4px solid #003366; padding: 12px 18px; margin-bottom: 20px; font-size: 14px; }
        .to-block strong { color: #003366; }
        .letter-text { font-size: 14.5px; color: #2d3748; text-align: justify; margin-bottom: 16px; line-height: 1.8; }
        .letter-text strong { color: #003366; }
        .notice-box { background: #fffdf2; border: 1px dashed #e9c46a; border-radius: 6px; padding: 15px 18px; margin: 20px 0; }
        .notice-box .title { font-weight: 800; color: #856404; font-size: 14px; margin-bottom: 6px; }
        .notice-box p { font-size: 13.5px; color: #5a4e1a; line-height: 1.7; }
        .sign-section { margin-top: 35px; }
        .sign-line { width: 250px; border-bottom: 2px solid #003366; height: 40px; margin-bottom: 6px; }
        .sign-name { font-weight: 700; color: #003366; font-size: 14px; }
        .sign-title { font-size: 12px; color: #5a6f85; }
        .page-footer { text-align: center; font-size: 11px; color: #5a6f85; padding: 12px; border-top: 1px solid #e2e8f0; margin-top: 30px; }

        /* PAGE 2 - Fees */
        .fees-section { padding: 30px 50px; }
        .section-banner { background: #003366; color: #FFD700; text-align: center; padding: 10px; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13.5px; }
        table th { background: #003366; color: #fff; padding: 10px 12px; text-align: left; font-weight: 700; font-size: 12px; text-transform: uppercase; }
        table td { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; }
        table tr:nth-child(even) { background: #f8fbff; }
        table .total-row { background: #003366 !important; color: #FFD700; font-weight: 800; }
        table .subtotal-row { background: #e8f0fe !important; font-weight: 700; color: #003366; }
        .payment-box { background: linear-gradient(135deg, #003366, #004488); color: #fff; border-radius: 8px; padding: 20px 25px; margin-top: 20px; }
        .payment-box h3 { color: #FFD700; font-size: 16px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; }
        .payment-box p { font-size: 14px; line-height: 1.8; }
        .payment-box .highlight { color: #FFD700; font-weight: 800; font-size: 16px; }

        /* PAGE 3 - Policy */
        .policy-section { padding: 30px 50px; }
        .policy-box { border: 1.5px solid #003366; border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
        .policy-box .header { background: #003366; color: #FFD700; padding: 10px 15px; font-weight: 700; font-size: 13px; text-transform: uppercase; }
        .policy-box .body { padding: 15px 18px; }
        .policy-box .body ol, .policy-box .body ul { margin-left: 20px; font-size: 13.5px; line-height: 1.9; color: #2d3748; }
        .prospectus-table { width: 100%; }
        .prospectus-table th { background: #003366; color: #fff; }
        .prospectus-table td { font-size: 13px; }

        .print-btn { position: fixed; top: 20px; right: 20px; background: linear-gradient(135deg, #003366, #004488); color: #FFD700; border: none; padding: 14px 28px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 15px; box-shadow: 0 6px 20px rgba(0,51,102,0.25); z-index: 100; font-family: 'Outfit', sans-serif; text-transform: uppercase; letter-spacing: 1px; }
        .print-btn:hover { transform: translateY(-3px); box-shadow: 0 10px 30px rgba(0,51,102,0.35); }
        .page-break { page-break-before: always; margin-top: 40px; }
        @media print { .print-btn { display: none; } body { padding: 0; background: white; } .letter-page { box-shadow: none; max-width: 100%; } .page-break { margin-top: 0; } }
        @media (max-width: 600px) { body { padding: 10px; } .letterhead, .letter-body, .fees-section, .policy-section { padding-left: 20px; padding-right: 20px; } .school-name { font-size: 20px; letter-spacing: 1px; } }
    </style>
</head>
<body>
    <button class="print-btn" onclick="window.print()">&#128424; Print / Save as PDF</button>

    <!-- ==================== PAGE 1: ADMISSION LETTER ==================== -->
    <div class="letter-page">
        <div class="letterhead">
            <div>${logoHtml}</div>
            <div class="school-name">General Fashion Academy</div>
            <div class="sub-banner">2025/2026 ADMISSION FORM &amp; LETTER</div>
            <div class="ref-grid">
                <div><span class="label">Admission Ref:</span> <span class="val">${escapeHtml(serial)}</span></div>
                <div><span class="label">Date:</span> <span class="val">${escapeHtml(dateStr)}</span></div>
                <div><span class="label">Academic Year:</span> <span class="val">2025/2026</span></div>
                <div><span class="label">Status:</span> <span class="val" style="color: #137333; font-weight:700;">Provisional Admission</span></div>
            </div>
        </div>

        <div class="letter-body">
            <div class="to-block">
                <strong>TO:</strong> ${escapeHtml(fullName)}<br>
                <strong>Admission ID:</strong> GFA-2025-${escapeHtml(serial)}<br>
                <strong>Contact:</strong> ${escapeHtml(phone)}
            </div>

            <div class="subject-line">Letter of Admission</div>

            <p class="letter-text">
                Dear <strong>${escapeHtml(fullName)}</strong>,
            </p>

            <p class="letter-text">
                We are pleased to inform you that you have been offered provisional admission into
                <strong>General Fashion Academy</strong> for the <strong>2025/2026 Academic Year</strong>
                to pursue our intensive professional program in <strong>Fashion Design, Garment Technology, and Styling</strong>.
            </p>

            <p class="letter-text">
                Your selection was based on your demonstrated passion for creative design and your alignment with the
                academy&rsquo;s rigorous standard of training future fashion industry leaders. The duration of this program spans
                across your scheduled academic cycles, combining thorough hands-on practical execution with conceptual
                business studies.
            </p>

            <p class="letter-text">
                To secure and confirm your placement at the academy, you are required to satisfy the financial obligations and
                adhere strictly to the schedule and regulations outlined in this document.
            </p>

            <div class="notice-box">
                <div class="title">&#9888; Important Notice:</div>
                <p>
                    Class structures, hostel accommodation facilities, and practical workshops will
                    commence strictly according to the calendar. Failure to complete registration requirements before the
                    deadline may result in the forfeiture of your slot.
                </p>
            </div>

            <div class="sign-section">
                <p style="margin-bottom: 5px; font-size: 14px; color: #2d3748;">Warm regards,</p>
                <div style="margin-top: 10px;">
                    <div class="sign-line"></div>
                    <div class="sign-name">The Admissions Office</div>
                    <div class="sign-title">General Fashion Academy</div>
                </div>
            </div>

            <div class="page-footer">General Fashion Academy &bull; 2025/2026 Admissions &bull; Page 1 of 3</div>
        </div>
    </div>

    <!-- ==================== PAGE 2: FEES & PROSPECTUS BREAKDOWN ==================== -->
    <div class="page-break"></div>
    <div class="letter-page">
        <div class="letterhead" style="padding-bottom: 15px;">
            <div>${logoHtml}</div>
            <div class="school-name">General Fashion Academy</div>
            <div class="sub-banner">Official Fees &amp; Prospectus Breakdown</div>
        </div>

        <div class="fees-section">
            <div class="section-banner">Fees &amp; Dues for First Year (2025/2026)</div>

            <table>
                <thead>
                    <tr><th>#</th><th>Item</th><th>Description</th><th>Amount (GH&cedil;)</th></tr>
                </thead>
                <tbody>
                    <tr><td>1</td><td>Tuition Fee</td><td>Academic tuition</td><td>2,800.00</td></tr>
                    <tr><td>2</td><td>Hostel Fee</td><td>Accommodation</td><td>1,300.00</td></tr>
                    <tr><td>3</td><td>Students Dues</td><td>See breakdown below</td><td>850.00</td></tr>
                    <tr class="subtotal-row"><td colspan="3" style="text-align:right;">SUBTOTAL (Fees &amp; Core Dues)</td><td>4,950.00</td></tr>
                </tbody>
            </table>

            <div class="section-banner">Student Dues (Detailed Breakdown)</div>

            <table>
                <thead>
                    <tr><th>Ref</th><th>Breakdown Item</th><th>Amount (GH&cedil;)</th></tr>
                </thead>
                <tbody>
                    <tr><td>a</td><td>SRC dues</td><td>100.00/semester</td></tr>
                    <tr><td>b</td><td>House dues</td><td>100.00</td></tr>
                    <tr><td>c</td><td>Welfare dues</td><td>50.00</td></tr>
                    <tr><td>d</td><td>Utility bills</td><td>300.00/semester</td></tr>
                    <tr><td>e</td><td>Uniform</td><td>120.00</td></tr>
                    <tr><td>f</td><td>Tools</td><td>180.00</td></tr>
                    <tr class="subtotal-row"><td colspan="2" style="text-align:right;">TOTAL STUDENT DUES</td><td>850.00</td></tr>
                </tbody>
            </table>

            <table>
                <tbody>
                    <tr class="total-row"><td colspan="2" style="text-align:right; padding:12px;">GRAND TOTAL</td><td style="padding:12px; font-size:16px;">GH&cedil; 4,950.00</td></tr>
                </tbody>
            </table>

            <div class="payment-box">
                <h3>&#128179; Payment Details</h3>
                <p>KINDLY ALL PAYMENTS TO MTN MOBILE ACCOUNT:</p>
                <p class="highlight">0556615604 (GENERAL FASHION ACADEMY)</p>
                <p style="margin-top: 10px;">KINDLY SEND THE SCREENSHOT OF PAYMENT ON WHATSAPP:</p>
                <p class="highlight">0244264872</p>
            </div>

            <div class="page-footer">General Fashion Academy &bull; 2025/2026 Admissions &bull; Page 2 of 3</div>
        </div>
    </div>

    <!-- ==================== PAGE 3: ADMISSIONS POLICY & REQUIREMENTS ==================== -->
    <div class="page-break"></div>
    <div class="letter-page">
        <div class="letterhead" style="padding-bottom: 15px;">
            <div>${logoHtml}</div>
            <div class="school-name">General Fashion Academy</div>
            <div class="sub-banner">Admissions Policy &amp; Requirements</div>
        </div>

        <div class="policy-section">
            <div class="policy-box">
                <div class="header">&#128197; Payment Plan</div>
                <div class="body">
                    <ol>
                        <li>All Fees and Dues must be fully paid instantly before class starts.</li>
                        <li><strong>2nd CONDITION:</strong> Hostel Fee and student dues must be paid in full.</li>
                        <li>Full payment or more than 50% of tuition fee must be paid before Class starts.</li>
                        <li>Payment of outstanding balance must be made in instalment of a period of 3 months.</li>
                    </ol>
                </div>
            </div>

            <div class="section-banner">2025/2026 Admissions Prospectus</div>

            <table class="prospectus-table">
                <thead>
                    <tr><th>#</th><th>Required Item</th><th>Specification / Notes</th></tr>
                </thead>
                <tbody>
                    <tr><td>1</td><td>Hand sewing machine</td><td>(self use)</td></tr>
                    <tr><td>2</td><td>Brand new industrial steam electric iron</td><td>(big size)</td></tr>
                    <tr><td>3</td><td>Insurance card</td><td>(valid)</td></tr>
                    <tr><td>4</td><td>Student mattress</td><td>Standard</td></tr>
                    <tr><td>5</td><td>Long broom</td><td>(2pcs)</td></tr>
                    <tr><td>6</td><td>Mob</td><td>(2)</td></tr>
                    <tr><td>7</td><td>Small cylinder</td><td>(self-cooking)</td></tr>
                    <tr><td>8</td><td>Tools and equipment</td><td>(provided by school)</td></tr>
                    <tr><td>9</td><td>Skirt or trousers</td><td>(Black)</td></tr>
                    <tr><td>10</td><td>Mosquito net</td><td>Standard</td></tr>
                    <tr><td>11</td><td>Plastic chair</td><td>Standard</td></tr>
                    <tr><td>12</td><td>Detergent</td><td>Standard</td></tr>
                </tbody>
            </table>

            <div class="page-footer">General Fashion Academy &bull; 2025/2026 Admissions &bull; Page 3 of 3</div>
        </div>
    </div>

</body>
</html>`;

    const blob = new Blob([letterHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = fullName.replace(/[^A-Za-z0-9 ]/g, "").replace(/\s+/g, "_");
    a.download = `GFA_Admission_Letter_${safeName}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
