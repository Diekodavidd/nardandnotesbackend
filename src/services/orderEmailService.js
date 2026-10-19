
const { Resend } = require("resend");

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function money(cents = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

async function sendOrderConfirmation(order, email) {
  if (!resend || !process.env.EMAIL_FROM) {
    return { sent: false, reason: "not_configured" };
  }

  const frontendUrl = (
    process.env.FRONTEND_URL || "http://localhost:3000"
  ).replace(/\/$/, "");

  const rows = (order.items || []).map((item) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #eee">
        ${escapeHtml(item.name)} — ${escapeHtml(item.size || item.sku || "")}
        × ${Number(item.quantity || 1)}
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right">
        ${money(item.lineTotalInCents || 0)}
      </td>
    </tr>
  `).join("");

  const testNotice = order.testMode
    ? `<p style="padding:12px;background:#fff3cd;color:#664d03">
         TEST ORDER — no payment was collected.
       </p>`
    : "";

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: [email],
    subject: `Order ${order.orderNumber} confirmed — NARD & NOTES`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#24211d">
        <h1 style="letter-spacing:3px">NARD &amp; NOTES</h1>
        <h2>Thank you for your order.</h2>
        ${testNotice}
        <p>Your order number is <strong>${escapeHtml(order.orderNumber)}</strong>.</p>
        <p>We'll send another update when your order ships.</p>
        <table style="width:100%;border-collapse:collapse">
          ${rows}
        </table>
        <p>Subtotal: <strong>${money(order.subtotalInCents)}</strong></p>
        <p>Standard shipping: <strong>${order.shippingInCents === 0 ? "Complimentary" : money(order.shippingInCents)}</strong></p>
        <p style="font-size:18px">Total: <strong>${money(order.totalInCents)}</strong></p>
        <p>Shipping to:</p>
        <p>
          ${escapeHtml(order.shippingAddress?.recipientName)}<br>
          ${escapeHtml(order.shippingAddress?.line1)}<br>
          ${escapeHtml(order.shippingAddress?.line2 || "")}<br>
          ${escapeHtml(order.shippingAddress?.city)},
          ${escapeHtml(order.shippingAddress?.state)}
          ${escapeHtml(order.shippingAddress?.postalCode)}<br>
          United States
        </p>
        <p><a href="${frontendUrl}/account/orders">View your orders</a></p>
        <p>With care,<br>NARD &amp; NOTES</p>
      </div>
    `,
  });

  if (error) {
    console.error("Resend order email error:", error);
    return { sent: false, reason: "failed" };
  }

  return { sent: true, id: data?.id };
}

async function sendShippingUpdate(order, email) {
  if (!resend || !process.env.EMAIL_FROM) {
    return { sent: false, reason: "not_configured" };
  }

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: [email],
    subject: `Your NARD & NOTES order ${order.orderNumber} has shipped`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#24211d">
        <h1>NARD &amp; NOTES</h1>
        <h2>Your order is on its way.</h2>
        <p>Order <strong>${escapeHtml(order.orderNumber)}</strong> has shipped.</p>
        ${
          order.trackingNumber
            ? `<p>Tracking number: <strong>${escapeHtml(order.trackingNumber)}</strong></p>`
            : ""
        }
        ${
          order.trackingUrl
            ? `<p><a href="${escapeHtml(order.trackingUrl)}">Track your delivery</a></p>`
            : ""
        }
        <p>Thank you for choosing NARD &amp; NOTES.</p>
      </div>
    `,
  });

  if (error) {
    console.error("Resend shipping email error:", error);
    return { sent: false, reason: "failed" };
  }

  return { sent: true, id: data?.id };
}

module.exports = {
  sendOrderConfirmation,
  sendShippingUpdate
};

