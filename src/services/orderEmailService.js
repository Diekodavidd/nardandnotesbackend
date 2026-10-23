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
  ).replace(/\/+$/, "");

  const currency = String(order.currency || "usd").toUpperCase();

  function formatAmount(cents = 0) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(Number(cents || 0) / 100);
  }

  const rows = (order.items || []).map((item) => `
    <tr>
      <td style="padding:18px 0;border-bottom:1px solid #eee8dd;">
        <div style="font-family:Georgia,serif;font-size:18px;color:#28251f;">
          ${escapeHtml(item.name)}
        </div>
        <div style="font-size:12px;color:#8b8172;margin-top:5px;">
          ${escapeHtml(item.size || item.sku || "")}
          &nbsp;·&nbsp; Qty ${Number(item.quantity || 1)}
        </div>
      </td>
      <td style="padding:18px 0;border-bottom:1px solid #eee8dd;
        text-align:right;white-space:nowrap;color:#28251f;">
        ${formatAmount(item.lineTotalInCents || 0)}
      </td>
    </tr>
  `).join("");

  const address = order.shippingAddress || {};

  const addressHtml = [
    address.recipientName,
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode]
      .filter(Boolean)
      .join(", "),
    address.country,
  ]
    .filter(Boolean)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join("");

  const buttonUrl = `${frontendUrl}/account/orders`;

  const html = `
    <!doctype html>
    <html>
      <body style="margin:0;padding:0;background:#f3f0e9;
        color:#292720;font-family:Arial,Helvetica,sans-serif;">
        <table role="presentation" width="100%" cellspacing="0"
          cellpadding="0" style="background:#f3f0e9;padding:28px 10px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0"
                cellpadding="0" style="max-width:620px;background:#fff;
                border:1px solid #e8e2d8;">

                <tr>
                  <td align="center" style="padding:38px 24px 30px;">
                    <div style="font-size:10px;letter-spacing:3px;
                      color:#91794b;margin-bottom:17px;">
                      THE ART OF PERSONAL FRAGRANCE
                    </div>

                    <div style="font-family:Georgia,'Times New Roman',serif;
                      font-size:29px;letter-spacing:4px;font-weight:bold;">
                      NARD &amp; NOTES
                    </div>

                    <div style="width:42px;height:1px;background:#b69a60;
                      margin:20px auto 13px;"></div>

                    <div style="font-size:10px;letter-spacing:2px;
                      color:#81796c;">
                      A MORE INTENTIONAL YOU
                    </div>
                  </td>
                </tr>

                <tr>
                  <td style="padding:18px 30px 28px;text-align:center;
                    background:#292720;color:#fff;">
                    <div style="font-size:10px;letter-spacing:2px;
                      color:#d2bd8b;margin-bottom:13px;">
                      ORDER CONFIRMATION
                    </div>

                    <div style="font-family:Georgia,'Times New Roman',serif;
                      font-size:30px;line-height:1.3;margin-bottom:12px;">
                      A beautiful choice.
                    </div>

                    <div style="font-size:14px;line-height:1.8;color:#e4e0d8;">
                      Thank you for choosing NARD &amp; NOTES.
                      Your order details are below.
                    </div>
                  </td>
                </tr>

                <tr>
                  <td style="padding:26px 30px 12px;">
                    <table role="presentation" width="100%"
                      cellspacing="0" cellpadding="0">
                      <tr>
                        <td>
                          <div style="font-size:10px;letter-spacing:1.5px;
                            color:#8a806f;margin-bottom:7px;">
                            ORDER REFERENCE
                          </div>
                          <div style="font-size:13px;font-weight:bold;">
                            ${escapeHtml(order.orderNumber)}
                          </div>
                        </td>

                        <td align="right">
                          <div style="font-size:10px;letter-spacing:1.5px;
                            color:#8a806f;margin-bottom:7px;">
                            TOTAL
                          </div>
                          <div style="font-family:Georgia,serif;font-size:23px;">
                            ${formatAmount(order.totalInCents)}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:8px 30px 25px;">
                    <table role="presentation" width="100%"
                      cellspacing="0" cellpadding="0">
                      ${rows}
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 30px 26px;">
                    <table role="presentation" width="100%"
                      cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:6px 0;color:#777064;font-size:13px;">
                          Subtotal
                        </td>
                        <td align="right" style="padding:6px 0;font-size:13px;">
                          ${formatAmount(order.subtotalInCents)}
                        </td>
                      </tr>

                      <tr>
                        <td style="padding:6px 0;color:#777064;font-size:13px;">
                          Shipping
                        </td>
                        <td align="right" style="padding:6px 0;font-size:13px;">
                          ${formatAmount(order.shippingInCents)}
                        </td>
                      </tr>

                      ${Number(order.discountInCents || 0) > 0 ? `
                        <tr>
                          <td style="padding:6px 0;color:#777064;font-size:13px;">
                            Discount
                          </td>
                          <td align="right" style="padding:6px 0;font-size:13px;">
                            −${formatAmount(order.discountInCents)}
                          </td>
                        </tr>
                      ` : ""}

                      <tr>
                        <td style="border-top:1px solid #e8e2d8;padding-top:16px;
                          font-family:Georgia,serif;font-size:19px;">
                          Total
                        </td>
                        <td align="right" style="border-top:1px solid #e8e2d8;
                          padding-top:16px;font-family:Georgia,serif;font-size:21px;">
                          ${formatAmount(order.totalInCents)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 30px 25px;">
                    <div style="font-size:10px;letter-spacing:1.5px;
                      color:#8a806f;margin-bottom:12px;">
                      DELIVERY ADDRESS
                    </div>

                    <div style="font-size:13px;line-height:1.9;color:#514c43;">
                      ${addressHtml}
                    </div>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding:0 30px 36px;">
                    <a href="${escapeHtml(buttonUrl)}"
                      style="display:inline-block;background:#292720;color:#fff;
                      text-decoration:none;padding:16px 27px;font-size:11px;
                      letter-spacing:1.5px;font-weight:bold;">
                      VIEW YOUR ORDERS
                    </a>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding:26px 20px;
                    background:#f7f4ee;border-top:1px solid #e8e2d8;">
                    <div style="font-family:Georgia,serif;font-size:18px;
                      margin-bottom:9px;">
                      With care, NARD &amp; NOTES
                    </div>

                    <div style="font-size:10px;letter-spacing:2px;
                      color:#8a806f;">
                      FRAGRANCES FOR A MORE INTENTIONAL YOU
                    </div>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: [email],
      subject: `Your NARD & NOTES order ${order.orderNumber}`,
      html,
    });

    if (error) {
      console.error("Resend order email error:", error);

      return {
        sent: false,
        reason: "failed",
        message: error.message || "Resend rejected the email request.",
      };
    }

    return { sent: true, id: data?.id };
  } catch (error) {
    console.error("Resend order email error:", error.message);

    return {
      sent: false,
      reason: "failed",
      message: error.message || "Email sending failed.",
    };
  }
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
  sendShippingUpdate,
};