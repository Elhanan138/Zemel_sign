// Bilingual strings: English + Hebrew
const STRINGS = {
  en: {
    tagline: 'Bilingual Document Signing',
    login_title: 'Sign In',
    register_title: 'Create Account',
    login_btn: 'Sign In',
    register_btn: 'Create Account',
    email: 'Email',
    password: 'Password',
    full_name: 'Full Name',
    no_account: "Don't have an account?",
    register_link: 'Create account',
    have_account: 'Already have an account?',
    login_link: 'Sign in',
    logout: 'Logout',
    back: 'Back',
    dashboard_title: 'My Documents',
    new_document: 'New Document',
    filter_all: 'All',
    filter_draft: 'Draft',
    filter_sent: 'Sent',
    filter_signed: 'Signed',
    filter_completed: 'Completed',
    filter_voided: 'Voided',
    upload_title: 'Upload Document',
    step1_label: 'Document Details',
    step2_label: 'Add Signers',
    doc_title: 'Document Title',
    drop_hint: 'Drag & drop PDF or DOCX here, or click to browse',
    browse_file: 'Browse File',
    signer_name: 'Name',
    signer_email: 'Email',
    signing_order: 'Order',
    signer_name_ph: 'Full name',
    signer_email_ph: 'email@example.com',
    add_signer: 'Add',
    upload_btn: 'Upload Document',
    send_btn: 'Send for Signing',
    place_fields_btn: 'Place Signature Fields',
    signers_label: 'Signers',
    field_type_label: 'Field Type',
    type_signature: 'Signature',
    type_initials: 'Initials',
    type_date: 'Date',
    field_place_hint: 'Select a signer, then click and drag on the document to place a field.',
    save_send_btn: 'Save & Send for Signing',
    signing_as: 'Signing as',
    fields_to_sign: 'Fields to Sign',
    your_signature: 'Your Signature',
    sig_draw: 'Draw',
    sig_type: 'Type',
    sig_upload: 'Upload',
    clear: 'Clear',
    apply_sig: 'Apply',
    type_your_name: 'Type your name',
    submit_signatures: 'Submit Signatures',
    decline_btn: 'Decline to Sign',
    waiting_signers: 'Waiting for previous signers',
    waiting_signers_desc: 'You will be notified when it is your turn to sign.',
    already_signed: 'You have already signed this document',
    already_signed_desc: 'Thank you for signing. The document is being processed.',
    audit_title: 'Audit Trail',
    no_events: 'No events yet',
    status_draft: 'Draft',
    status_sent: 'Sent',
    status_partially_signed: 'Partially Signed',
    status_signed: 'Signed',
    status_completed: 'Completed',
    status_voided: 'Voided',
    btn_place_fields: 'Place Fields',
    btn_send: 'Send',
    btn_download: 'Download',
    btn_audit: 'Audit',
    btn_void: 'Void',
    btn_delete: 'Delete',
    confirm_void: 'Are you sure you want to void this document? This cannot be undone.',
    confirm_delete: 'Are you sure you want to delete this document?',
    no_docs: 'No Documents Yet',
    no_docs_hint: 'Upload a document to get started',
    signer_count: (n) => `${n} signer${n !== 1 ? 's' : ''}`,
    page_count: (n) => `${n} page${n !== 1 ? 's' : ''}`,
    signing_link_label: 'Signing link for',
    send_success: 'Document sent! Copy the signing links below to share with signers.',
    upload_success: 'Document uploaded successfully.',
    click_to_sign: 'Click to sign',
    click_to_fill: 'Click to fill',
    field_page: 'Page',
    field_signed: 'Signed',
    sig_applied: 'Signature applied',
    sig_complete: 'All signatures submitted successfully!',
    declined: 'You have declined to sign this document.',
  },
  he: {
    tagline: 'חתימה דו-לשונית על מסמכים',
    login_title: 'כניסה למערכת',
    register_title: 'יצירת חשבון',
    login_btn: 'כניסה',
    register_btn: 'יצירת חשבון',
    email: 'כתובת דוא"ל',
    password: 'סיסמה',
    full_name: 'שם מלא',
    no_account: 'אין לך חשבון?',
    register_link: 'צור חשבון',
    have_account: 'כבר יש לך חשבון?',
    login_link: 'כניסה',
    logout: 'יציאה',
    back: 'חזרה',
    dashboard_title: 'המסמכים שלי',
    new_document: 'מסמך חדש',
    filter_all: 'הכל',
    filter_draft: 'טיוטה',
    filter_sent: 'נשלח',
    filter_signed: 'חתום',
    filter_completed: 'הושלם',
    filter_voided: 'בוטל',
    upload_title: 'העלאת מסמך',
    step1_label: 'פרטי המסמך',
    step2_label: 'הוספת חותמים',
    doc_title: 'שם המסמך',
    drop_hint: 'גרור ושחרר קובץ PDF או DOCX לכאן, או לחץ לבחירה',
    browse_file: 'בחר קובץ',
    signer_name: 'שם',
    signer_email: 'דוא"ל',
    signing_order: 'סדר',
    signer_name_ph: 'שם מלא',
    signer_email_ph: 'example@email.com',
    add_signer: 'הוסף',
    upload_btn: 'העלה מסמך',
    send_btn: 'שלח לחתימה',
    place_fields_btn: 'מקם שדות חתימה',
    signers_label: 'חותמים',
    field_type_label: 'סוג שדה',
    type_signature: 'חתימה',
    type_initials: 'ראשי תיבות',
    type_date: 'תאריך',
    field_place_hint: 'בחר חותם, לאחר מכן לחץ וגרור על המסמך למיקום שדה.',
    save_send_btn: 'שמור ושלח לחתימה',
    signing_as: 'חותם בשם',
    fields_to_sign: 'שדות לחתימה',
    your_signature: 'החתימה שלך',
    sig_draw: 'ציור',
    sig_type: 'הקלדה',
    sig_upload: 'העלאה',
    clear: 'נקה',
    apply_sig: 'החל',
    type_your_name: 'הקלד את שמך',
    submit_signatures: 'שלח חתימות',
    decline_btn: 'סירוב לחתום',
    waiting_signers: 'ממתין לחותמים קודמים',
    waiting_signers_desc: 'תקבל הודעה כשיגיע תורך לחתום.',
    already_signed: 'כבר חתמת על מסמך זה',
    already_signed_desc: 'תודה על החתימה. המסמך מעובד.',
    audit_title: 'מסלול ביקורת',
    no_events: 'אין אירועים עדיין',
    status_draft: 'טיוטה',
    status_sent: 'נשלח',
    status_partially_signed: 'חתום חלקית',
    status_signed: 'חתום',
    status_completed: 'הושלם',
    status_voided: 'בוטל',
    btn_place_fields: 'מקם שדות',
    btn_send: 'שלח',
    btn_download: 'הורד',
    btn_audit: 'ביקורת',
    btn_void: 'בטל',
    btn_delete: 'מחק',
    confirm_void: 'האם אתה בטוח שברצונך לבטל מסמך זה? לא ניתן לבטל פעולה זו.',
    confirm_delete: 'האם אתה בטוח שברצונך למחוק מסמך זה?',
    no_docs: 'אין מסמכים עדיין',
    no_docs_hint: 'העלה מסמך כדי להתחיל',
    signer_count: (n) => `${n} חותם${n !== 1 ? 'ים' : ''}`,
    page_count: (n) => `${n} עמוד${n !== 1 ? 'ות' : ''}`,
    signing_link_label: 'קישור חתימה עבור',
    send_success: 'המסמך נשלח! העתק את קישורי החתימה למטה ושתף עם החותמים.',
    upload_success: 'המסמך הועלה בהצלחה.',
    click_to_sign: 'לחץ לחתימה',
    click_to_fill: 'לחץ למילוי',
    field_page: 'עמוד',
    field_signed: 'חתום',
    sig_applied: 'חתימה הוחלה',
    sig_complete: 'כל החתימות נשלחו בהצלחה!',
    declined: 'סירבת לחתום על מסמך זה.',
  }
};

let currentLang = localStorage.getItem('lang') || 'en';

function t(key, ...args) {
  const val = STRINGS[currentLang][key] || STRINGS['en'][key] || key;
  return typeof val === 'function' ? val(...args) : val;
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('lang', lang);
  const html = document.documentElement;
  html.lang = lang;
  html.dir = lang === 'he' ? 'rtl' : 'ltr';

  const rtlSheet = document.getElementById('rtl-stylesheet');
  if (rtlSheet) rtlSheet.disabled = (lang !== 'he');

  document.querySelectorAll('[id^="btn-"]').forEach(btn => btn.classList.remove('active'));
  const activeLangBtn = document.getElementById(`btn-${lang}`);
  if (activeLangBtn) activeLangBtn.classList.add('active');

  applyI18n();
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const str = t(key);
    if (typeof str === 'string') el.textContent = str;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const str = t(key);
    if (typeof str === 'string') el.placeholder = str;
  });
}

function logout() {
  const token = localStorage.getItem('token');
  if (token) {
    fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      .catch(() => {});
  }
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

// Init on load
(function init() {
  const lang = localStorage.getItem('lang') || 'en';
  setLang(lang);
})();
