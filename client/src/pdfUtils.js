import html2pdf from 'html2pdf.js';

/**
 * Formats a phone number with country code +91 and masks all except the last 4 digits.
 * Example: "9876543210" -> "+91 XXXXXX3210"
 */
export function formatMaskedPhone(phone) {
    if (!phone) return '+91 XXXXXX0000';
    const str = String(phone).trim();
    if (str.includes('X') || str.includes('x')) return str; // already masked
    const digits = str.replace(/\D/g, '');
    const clean = digits.startsWith('91') && digits.length > 10 ? digits.slice(2) : digits;
    if (!clean) return '+91 XXXXXX0000';
    const last4 = clean.length >= 4 ? clean.slice(-4) : clean.padStart(4, '0');
    return `+91 XXXXXX${last4}`;
}

export function getInvoicePdfOptions(el, invoiceNumber = 'KVIC-eBill') {
    const elWidth = el ? (el.offsetWidth || el.clientWidth || 580) : 580;
    const elHeight = el ? (el.offsetHeight || el.scrollHeight || el.clientHeight || 460) : 460;

    // Standard width in mm for a clean receipt document (160mm)
    const pdfWidthMm = 160;
    const marginMm = 4;
    const contentWidthMm = pdfWidthMm - (marginMm * 2);

    // Calculate proportional height to match element height precisely (no awkward empty bottom space)
    const contentHeightMm = (elHeight / elWidth) * contentWidthMm;
    const pdfHeightMm = Math.ceil(contentHeightMm + (marginMm * 2));

    return {
        margin: [marginMm, marginMm, marginMm, marginMm],
        filename: `${invoiceNumber}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
            scale: 2.5, 
            useCORS: true, 
            letterRendering: true, 
            logging: false,
            windowWidth: elWidth
        },
        jsPDF: { 
            unit: 'mm', 
            format: [pdfWidthMm, pdfHeightMm], 
            orientation: 'portrait' 
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };
}

export async function downloadInvoicePDF(elementId, invoiceNumber = 'KVIC-eBill') {
    const el = document.getElementById(elementId);
    if (!el) throw new Error(`#${elementId} not found in DOM`);
    const options = getInvoicePdfOptions(el, invoiceNumber);
    return html2pdf().set(options).from(el).save();
}

/**
 * Shares the verified e-Bill with PDF attachment, provenance verification link, and summary info.
 */
export async function shareInvoiceOnWhatsApp({ 
    elementId, 
    invoiceNumber, 
    bottleSerial, 
    verifyUrl, 
    customerPhone = '', 
    customerName = '',
    floraName = '',
    totalAmount = ''
}) {
    const msg =
        `🍯 *KVIC HoneyChain Verified e-Bill*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🧾 *Invoice No:* ${invoiceNumber}\n` +
        (customerName ? `👤 *Customer:* ${customerName}\n` : '') +
        (floraName ? `🌸 *Flora:* ${floraName}\n` : '') +
        (totalAmount ? `💰 *Total Paid:* ₹${totalAmount}\n` : '') +
        `📦 *Bottle Serial:* ${bottleSerial}\n` +
        `🛡️ *Authenticity:* 100% Certified Pure (KVIC National Honey Mission)\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🔗 *Verify Live Provenance & Lab Test:* ${verifyUrl}\n\n` +
        `📄 Official PDF tax invoice attached.`;

    const phoneDigits = customerPhone.replace(/\D/g, '');
    const cleanPhone = phoneDigits.startsWith('91') && phoneDigits.length > 10 ? phoneDigits.slice(2) : phoneDigits;
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const waUrl = fullPhone
        ? `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`
        : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    const el = document.getElementById(elementId);
    if (el) {
        try {
            const options = getInvoicePdfOptions(el, invoiceNumber);
            const blob = await html2pdf()
                .set(options)
                .from(el)
                .outputPdf('blob');

            const file = new File([blob], `${invoiceNumber}.pdf`, { type: 'application/pdf' });
            if (navigator.canShare?.({ files: [file] })) {
                await navigator.share({ 
                    title: `KVIC Verified Invoice - ${invoiceNumber}`, 
                    text: msg, 
                    files: [file] 
                });
                return { mode: 'web-share', success: true };
            }
        } catch (e) {
            console.warn('Native Web Share failed or cancelled:', e);
        }

        // fallback: auto-download PDF then open WhatsApp/Web link with info & URL
        await downloadInvoicePDF(elementId, invoiceNumber).catch(() => {});
    }

    window.open(waUrl, '_blank', 'noopener,noreferrer');
    return { mode: 'download-and-open', success: true, filename: `${invoiceNumber}.pdf` };
}
