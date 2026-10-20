const { Resend } = require('resend');
async function sendNewOrderAlert(order) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM || !process.env.ADMIN_ORDER_EMAIL) return { sent: false, reason: 'not_configured' };
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: [process.env.ADMIN_ORDER_EMAIL],
    subject: `New NARD & NOTES order ${order.orderNumber}`,
    html: `<div style="font-family:Arial,sans-serif"><h1>New order received</h1><p>Order: <strong>${String(order.orderNumber).replace(/[&<>"']/g, '')}</strong></p><p>Total: ${(order.totalInCents / 100).toFixed(2)} ${String(order.currency || 'usd').toUpperCase()}</p><p>Items: ${order.items.map((i) => `${String(i.name).replace(/[&<>"']/g, '')} (${String(i.size).replace(/[&<>"']/g, '')}) × ${Number(i.quantity)}`).join(', ')}</p><p>Review the order in your store administration.</p></div>`
  });
  if (error) { console.error('Admin order email failed:', error); return { sent: false, reason: 'failed' }; }
  return { sent: true, id: data?.id };
}
module.exports = { sendNewOrderAlert };
