const SHIPPO_BASE = "https://api.goshippo.com";
const { parsePhoneNumberFromString } = require("libphonenumber-js");

function requireShippo() {
  if (!process.env.SHIPPO_API_KEY) {
    const error = new Error(
      "Shippo is not configured. Add SHIPPO_API_KEY to the backend environment."
    );
    error.status = 503;
    throw error;
  }
}

function normalizeShippingPhone(value, country) {
  const phone = String(value || "").trim();
  const region = String(country || "").trim().toUpperCase();

  if (!phone || !region) return "";

  try {
    const parsed = parsePhoneNumberFromString(phone, region);
    return parsed && parsed.isValid() ? parsed.number : "";
  } catch {
    return "";
  }
}

async function shippoRequest(path, options = {}) {
  requireShippo();

  let response;
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      response = await fetch(`${SHIPPO_BASE}${path}`, {
        ...options,
        headers: {
          Authorization: `ShippoToken ${process.env.SHIPPO_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(options.headers || {}),
        },
        signal: AbortSignal.timeout(20000),
      });
      break;
    } catch (error) {
      lastError = error;

      console.error("[Shippo network request failed]", {
        path,
        attempt,
        name: error.name,
        message: error.message,
        causeCode: error.cause?.code || null,
      });

      const method = String(options.method || "GET").toUpperCase();
      const retryAllowed =
        method === "GET" ||
        (method === "POST" && path === "/shipments/");

      if (attempt < 3 && retryAllowed) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * attempt)
        );
      } else {
        break;
      }
    }
  }

  if (!response) {
    const error = new Error(
      `Unable to connect to Shippo after retries: ${
        lastError?.cause?.code || lastError?.message || "network error"
      }`
    );
    error.status = 503;
    throw error;
  }

  const responseText = await response.text();
  let body = {};

  try {
    body = responseText ? JSON.parse(responseText) : {};
  } catch {
    body = { rawResponse: responseText.slice(0, 1000) };
  }

  if (!response.ok) {
    console.error("[Shippo API error]", {
      status: response.status,
      path,
      response: JSON.stringify(body, null, 2),
    });

    const detail =
      body.detail ||
      body.message ||
      body.error ||
      (body.errors ? JSON.stringify(body.errors) : "");

    const error = new Error(
      detail
        ? `Shippo request failed: ${String(detail).slice(0, 500)}`
        : `Shippo request failed with HTTP ${response.status}.`
    );

    error.status = response.status >= 500 ? 502 : 400;
    throw error;
  }

  return body;
}

function addressFromEnv() {
  const required = [
    "SHIPPO_FROM_NAME",
    "SHIPPO_FROM_STREET1",
    "SHIPPO_FROM_CITY",
    "SHIPPO_FROM_STATE",
    "SHIPPO_FROM_ZIP",
    "SHIPPO_FROM_COUNTRY",
    "SHIPPO_FROM_PHONE",
    "SHIPPO_FROM_EMAIL",
  ];

  const missing = required.filter(
    (key) => !String(process.env[key] || "").trim()
  );

  if (missing.length) {
    const error = new Error(
      `Configure Shippo ship-from details: ${missing.join(", ")}.`
    );
    error.status = 503;
    throw error;
  }

  const country = process.env.SHIPPO_FROM_COUNTRY.trim().toUpperCase();
  const phone = normalizeShippingPhone(
    process.env.SHIPPO_FROM_PHONE,
    country
  );

  if (!phone) {
    const error = new Error(
      "SHIPPO_FROM_PHONE must be a valid phone number for the sender country."
    );
    error.status = 503;
    throw error;
  }

  return {
    name: process.env.SHIPPO_FROM_NAME.trim(),
    street1: process.env.SHIPPO_FROM_STREET1.trim(),
    street2: process.env.SHIPPO_FROM_STREET2 || "",
    city: process.env.SHIPPO_FROM_CITY.trim(),
    state: process.env.SHIPPO_FROM_STATE.trim(),
    zip: process.env.SHIPPO_FROM_ZIP.trim(),
    country,
    phone,
    email: process.env.SHIPPO_FROM_EMAIL.trim(),
  };
}

function getExportDeclarationCode(destinationCountry) {
  /*
   * These exemption codes are not universally valid for every shipment.
   * Use them only when the export qualifies. If AES filing is required,
   * supply the applicable ITN instead.
   */
  if (destinationCountry === "CA") {
    return "NOEEI_30_36";
  }

  return "NOEEI_30_37_a";
}

async function getRates({ addressTo, parcel, customsItems = [] }) {
  if (!addressTo || typeof addressTo !== "object") {
    const error = new Error("A valid destination address is required.");
    error.status = 400;
    throw error;
  }

  if (!parcel || typeof parcel !== "object") {
    const error = new Error("A valid shipping parcel is required.");
    error.status = 400;
    throw error;
  }

  const sender = addressFromEnv();
  const destinationCountry = String(addressTo.country || "")
    .trim()
    .toUpperCase();

  if (!/^[A-Z]{2}$/.test(destinationCountry)) {
    const error = new Error(
      "Destination country must be a valid two-letter country code."
    );
    error.status = 400;
    throw error;
  }

  const normalizedPhone = normalizeShippingPhone(
    addressTo.phone,
    destinationCountry
  );

  if (!normalizedPhone) {
    const error = new Error(
      "Enter a valid recipient phone number for the selected delivery country."
    );
    error.status = 400;
    throw error;
  }

  const normalizedAddressTo = {
    ...addressTo,
    country: destinationCountry,
    phone: normalizedPhone,
  };

  let customsDeclarationId = null;

  if (destinationCountry !== sender.country) {
    if (!Array.isArray(customsItems) || customsItems.length === 0) {
      const error = new Error(
        "International shipping requires verified customs item details."
      );
      error.status = 400;
      throw error;
    }

    const eelPfc = getExportDeclarationCode(destinationCountry);

    if (!eelPfc) {
      const error = new Error(
        "A valid export declaration code is required for international shipping."
      );
      error.status = 400;
      throw error;
    }

    const declarationPayload = {
      contents_type: "MERCHANDISE",
      non_delivery_option: "RETURN",
      certify: true,
      certify_signer: sender.name,
      incoterm: "DDU",
      eel_pfc: eelPfc,
      items: customsItems,
    };

    console.log("[Shippo customs declaration request]", {
      destinationCountry,
      itemCount: customsItems.length,
      eel_pfc: eelPfc,
    });

    const declaration = await shippoRequest(
      "/customs/declarations/",
      {
        method: "POST",
        body: JSON.stringify(declarationPayload),
      }
    );

    customsDeclarationId = String(
      declaration.object_id || ""
    ).trim();

    if (!customsDeclarationId) {
      const error = new Error(
        "Shippo did not return a customs declaration ID."
      );
      error.status = 502;
      throw error;
    }

    /*
     * Fetch the saved declaration to verify what Shippo actually stored.
     * Do not create a shipment if the saved declaration lacks eel_pfc.
     */
    const savedDeclaration = await shippoRequest(
      `/customs/declarations/${encodeURIComponent(
        customsDeclarationId
      )}/`
    );

    const savedEelPfc = String(
      savedDeclaration.eel_pfc || ""
    ).trim();

    console.log("[Shippo customs declaration verification]", {
      declarationId: customsDeclarationId,
      destinationCountry,
      requestedEelPfc: eelPfc,
      savedEelPfc: savedEelPfc || null,
      itemCount: Array.isArray(savedDeclaration.items)
        ? savedDeclaration.items.length
        : null,
    });

    if (savedEelPfc !== eelPfc) {
      const error = new Error(
        "Shippo did not save the required export declaration code. No shipment was created. Check the customs declaration response and Shippo API configuration."
      );
      error.status = 502;
      throw error;
    }
  }

  const shipmentPayload = {
    address_from: sender,
    address_to: normalizedAddressTo,
    parcels: [parcel],
    async: false,
    ...(customsDeclarationId
      ? { customs_declaration: customsDeclarationId }
      : {}),
  };

  const shipment = await shippoRequest("/shipments/", {
    method: "POST",
    body: JSON.stringify(shipmentPayload),
  });

  console.log("[Shippo shipment created]", {
    shipmentId: shipment.object_id,
    destinationCountry,
    customsDeclarationId,
  });

  return {
    shipmentId: shipment.object_id,
    destinationCountry,
    rates: (shipment.rates || [])
      .filter(
        (rate) =>
          rate.object_id &&
          rate.amount != null &&
          rate.currency &&
          rate.provider
      )
      .map((rate) => ({
        id: rate.object_id,
        provider: rate.provider,
        service: rate.servicelevel?.name || "Standard",
        amount: Number(rate.amount),
        currency: rate.currency,
        estimatedDays: rate.estimated_days ?? null,
        durationTerms: rate.duration_terms || "",
      })),
  };
}

async function getRate(rateId) {
  if (!rateId) {
    const error = new Error("A valid Shippo rate ID is required.");
    error.status = 400;
    throw error;
  }

  return shippoRequest(
    `/rates/${encodeURIComponent(rateId)}/`
  );
}

async function purchaseLabel(rateId) {
  if (!rateId) {
    const error = new Error("A valid Shippo rate ID is required.");
    error.status = 400;
    throw error;
  }

  return shippoRequest("/transactions/", {
    method: "POST",
    body: JSON.stringify({
      rate: rateId,
      label_file_type: "PDF",
      async: false,
    }),
  });
}

module.exports = {
  getRates,
  getRate,
  purchaseLabel,
};