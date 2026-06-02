// netlify/functions/get-business-by-location.js
// Fetches Location + linked Business data from Airtable by Location Record ID
// Called by checkin.html — keeps your Airtable API key hidden from the browser

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_API_URL = 'https://api.airtable.com/v0';

exports.handler = async function(event, context) {
  // CORS headers — allow your domain in production
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const locId = event.queryStringParameters?.loc;

  if (!locId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing location ID' })
    };
  }

  try {
    // Step 1: Get the Location record by Record ID
    const locRes = await fetch(
      `${AIRTABLE_API_URL}/${AIRTABLE_BASE_ID}/Locations/${locId}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } }
    );

    if (!locRes.ok) {
      const err = await locRes.json();
      console.error('Location fetch error:', err);
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Location not found' })
      };
    }

    const location = await locRes.json();
    const locationFields = location.fields;

    // Step 2: Get the linked Business record
    // Airtable linked records return an array of Record IDs
    const businessIds = locationFields['Business'];
    if (!businessIds || businessIds.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'No business linked to this location' })
      };
    }

    const businessId = businessIds[0];
    const bizRes = await fetch(
      `${AIRTABLE_API_URL}/${AIRTABLE_BASE_ID}/Businesses/${businessId}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } }
    );

    if (!bizRes.ok) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Business not found' })
      };
    }

    const business = await bizRes.json();
    const biz = business.fields;

    // Step 3: Check business is active
    if (biz['Status'] !== 'Active') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'This business account is not currently active' })
      };
    }

    // Step 4: Return only the fields the frontend needs
    // Never return sensitive fields like Staff PIN, Daily Code, or Stripe ID
    const response = {
      location_id: locId,
      location_name: locationFields['Location Name'] || 'Main Location',
      business_id: businessId,
      business_name: biz['Business Name'] || '',
      logo_url: biz['Logo URL'] || null,
      city: biz['City'] || '',
      state: biz['State'] || '',
      reward_name: biz['Reward Name'] || 'Free reward',
      stamps_required: biz['Stamps Required'] || 10,
      // Only reveal the SECURITY TYPE — never the actual code/PIN
      check_in_security: biz['Check-in Security'] || 'None',
      min_hours_between_stamps: biz['Min Hours Between Stamps'] || 4
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };

  } catch (err) {
    console.error('Unexpected error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
