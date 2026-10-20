
const Product = require('../models/Product');
const { getRates } = require('../services/shippoService');

exports.getRates = async (req, res, next) => {
  try {
    const { addressTo, parcel, items: requestedItems } = req.body || {};

    const requiredAddress = [
      'name', 'street1', 'city', 'state', 'zip', 'country',
    ];

    if (
      !addressTo ||
      requiredAddress.some(
        (key) => !String(addressTo[key] || '').trim()
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'Provide recipient name, street, city, state, postal code and country.',
      });
    }

    const weight = Number(parcel?.weight);
    const length = Number(parcel?.length);
    const width = Number(parcel?.width);
    const height = Number(parcel?.height);
    const distanceUnit = String(parcel?.distance_unit || 'in');
    const massUnit = String(parcel?.mass_unit || 'lb');

    if (
      ![weight, length, width, height].every(
        (n) => Number.isFinite(n) && n > 0
      ) ||
      !['in', 'cm'].includes(distanceUnit) ||
      !['lb', 'oz', 'g', 'kg'].includes(massUnit)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Provide positive parcel weight, length, width and height with supported units.',
      });
    }

    const destinationCountry = String(addressTo.country)
      .trim()
      .toUpperCase();

    const senderCountry = String(
      process.env.SHIPPO_FROM_COUNTRY || ''
    ).trim().toUpperCase();

    let customsItems = [];

    // Customs declarations are needed for international shipments.
    if (destinationCountry !== senderCountry) {
      if (
        !Array.isArray(requestedItems) ||
        requestedItems.length < 1 ||
        requestedItems.length > 50
      ) {
        return res.status(400).json({
          success: false,
          message: 'Cart items are required to calculate international shipping.',
        });
      }

      customsItems = [];

      for (const requested of requestedItems) {
        const sku = String(requested?.sku || '').trim();
        const quantity = Number(requested?.quantity);

        if (
          !sku ||
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > 10
        ) {
          return res.status(400).json({
            success: false,
            message: 'An international shipping item has an invalid SKU or quantity.',
          });
        }

        const product = await Product.findOne({
          'variants.sku': sku,
          active: true,
        });

        const variant = product?.variants?.find(
          (entry) => entry.sku === sku && entry.active
        );

        if (!product || !variant) {
          return res.status(400).json({
            success: false,
            message: `Active product variant not found: ${sku}`,
          });
        }

        const productWeight = Number(product.shipping?.weightGrams);
        const originCountry = String(
          product.shipping?.originCountry || ''
        ).trim().toUpperCase();
        const priceInCents = Number(variant.priceInCents);

        if (
          !Number.isFinite(productWeight) ||
          productWeight <= 0 ||
          !/^[A-Z]{2}$/.test(originCountry) ||
          !Number.isInteger(priceInCents) ||
          priceInCents < 1
        ) {
          return res.status(422).json({
            success: false,
            message: `${product.name} is missing valid shipping weight, origin country or declared value data.`,
          });
        }

        customsItems.push({
          description: `${product.name} fragrance, ${variant.size}`,
          quantity,
          net_weight: String(productWeight),
          mass_unit: 'g',
          value_amount: (priceInCents / 100).toFixed(2),
          value_currency: 'USD',
          origin_country: originCountry,
          ...(product.shipping.hsCode
            ? { tariff_number: product.shipping.hsCode }
            : {}),
        });
      }
    }

    const result = await getRates({
      addressTo: {
        ...addressTo,
        country: destinationCountry,
      },
      parcel: {
        weight: String(weight),
        length: String(length),
        width: String(width),
        height: String(height),
        distance_unit: distanceUnit,
        mass_unit: massUnit,
      },
      customsItems,
    });

    return res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};
