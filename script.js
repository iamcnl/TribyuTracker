/**
 * Tribyu Tracker - shared data layer.
 *
 * Loads the archived mining/auction data from the JSON files in `data/`,
 * normalizes it, and exposes helpers on `window` for index.html, detail.html and calculator.html:
 *   - processData()            full dataset (prize pool, hashrate, payments, auctions, history)
 *   - processCalculatorData()  lighter dataset for the reward calculator
 *   - getAverageHashrate24h/7d/30d()
 *
 * The files in `data/` are exports from the original Worker (see the TribyuDatabase repo).
 */

const snapshotPath = 'data';

function normalizeTimestamp(value) {
  if (typeof value !== 'string') return value;
  const match = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/);
  return match ? `${match[1]}T${match[2]}Z` : value;
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) throw new Error('Unexpected response shape');
  return rows.map(row => {
    const copy = { ...row };
    if ('timestamp' in copy) copy.timestamp = normalizeTimestamp(copy.timestamp);
    if ('last_updated' in copy) copy.last_updated = normalizeTimestamp(copy.last_updated);
    return copy;
  });
}

async function fetchJson(route) {
  const url = `${snapshotPath}/${route}.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return normalizeRows(await response.json());
}

async function fetchJsonOrEmpty(route) {
  try {
    return await fetchJson(route);
  } catch (error) {
    console.warn(`No data for ${route}:`, error.message);
    return [];
  }
}

/** Loads the four data files and returns raw rows plus latest-row summaries. */
async function fetchData() {
  try {
    const [channelData, paymentData, auctionData, ahHistoryData] = await Promise.all([
      fetchJson('get-channel-data'),
      fetchJson('get-payment-data'),
      fetchJsonOrEmpty('get-auction-data'),
      fetchJsonOrEmpty('get-ah-history')
    ]);

    // channelData contains: [{id, prize_pool, hashrate, timestamp}]
    // paymentData contains: [{id, timestamp, sats_paid}]
    // auctionData contains: [{id, username, item, quantity, price, timestamp, item_id}]
    // ahHistoryData contains: [{id, seller, buyer, item, quantity, price, timestamp}]

    const latestChannelRow = channelData.find(row => parseFloat(String(row.prize_pool).replace(/,/g, '')) > 0) || channelData[0] || {};
    const latestPaymentRow = paymentData.length > 0 ? paymentData[0] : {};
    const latestAuctionRow = auctionData.length > 0 ? auctionData[0] : {};
    const latestAhHistoryRow = ahHistoryData.length > 0 ? ahHistoryData[0] : {};

    const cleanNumber = (value) => {
      if (typeof value === 'string') {
        return parseFloat(value.replace(/,/g, '')) || 0;
      }
      return parseFloat(value) || 0;
    };

    const totalSatsPaid = paymentData.reduce((sum, row) => sum + cleanNumber(row.sats_paid), 0);
    const latestTimestamp = (rows) => rows.reduce((max, row) => Math.max(max, Date.parse(row.timestamp) || 0), 0);
    const asOf = Math.max(latestTimestamp(channelData), latestTimestamp(paymentData)) || Date.now();
    const last24hThreshold = asOf - 24 * 60 * 60 * 1000;
    const satsLast24h = paymentData
      .filter(row => {
        const time = new Date(row.timestamp);
        return time.getTime() >= last24hThreshold;
      })
      .reduce((sum, row) => sum + cleanNumber(row.sats_paid), 0);

    const data = {
      prizePool: cleanNumber(latestChannelRow.prize_pool),
      hashrate: cleanNumber(latestChannelRow.hashrate),
      lastPaymentAmount: cleanNumber(latestPaymentRow.sats_paid),
      lastPaymentTime: latestPaymentRow.timestamp || '',
      totalSatsPaid,
      satsLast24h,
      asOf,
      mainSheet: channelData,
      paymentSheet: paymentData,
      auctionSheet: auctionData,
      ahHistorySheet: ahHistoryData,
      latestAuction: {
        username: latestAuctionRow.username || '',
        item: latestAuctionRow.item || '',
        quantity: cleanNumber(latestAuctionRow.quantity),
        price: cleanNumber(latestAuctionRow.price),
        auctionTime: latestAuctionRow.timestamp || ''
      },
      latestAhHistory: {
        seller: latestAhHistoryRow.seller || '',
        buyer: latestAhHistoryRow.buyer || '',
        item: latestAhHistoryRow.item || '',
        quantity: cleanNumber(latestAhHistoryRow.quantity),
        price: cleanNumber(latestAhHistoryRow.price),
        ahHistoryTime: latestAhHistoryRow.timestamp || ''
      }
    };

    return data;

  } catch (error) {
    console.error('Error fetching data:', error.message);
    return {
      prizePool: 0,
      hashrate: 0,
      lastPaymentAmount: 0,
      lastPaymentTime: '',
      totalSatsPaid: 0,
      satsLast24h: 0,
      asOf: Date.now(),
      mainSheet: [],
      paymentSheet: [],
      auctionSheet: [],
      ahHistorySheet: [],
      latestAuction: {
        username: '',
        item: '',
        quantity: 0,
        price: 0,
        auctionTime: ''
      },
      latestAhHistory: {
        seller: '',
        buyer: '',
        item: '',
        quantity: 0,
        price: 0,
        ahHistoryTime: ''
      }
    };
  }
}

/** Cleans raw rows from fetchData() into display-ready, JSON-serialized series. */
async function processData() {
  try {
    const data = await fetchData();

    const cleanNumber = (value) => {
      if (typeof value === 'string') {
        const cleaned = value.replace(/,/g, '').replace(/[^0-9.-]/g, ''); // Remove non-numeric chars except . and -
        return isNaN(parseFloat(cleaned)) ? null : parseFloat(cleaned);
      }
      return parseFloat(value) || null;
    };

    const formatNumber = (value) => {
      if (value == null || value === 'N/A') return 'N/A';
      return Number(value).toLocaleString('en-US', { minimumFractionDigits: 0 });
    };

    const prizePool = formatNumber(data.prizePool);
    const hashrate = formatNumber(data.hashrate);
    const lastPaymentAmount = formatNumber(data.lastPaymentAmount);
    const lastPaymentTime = data.lastPaymentTime || '';
    const totalSatsPaid = formatNumber(data.totalSatsPaid);
    const satsLast24h = formatNumber(data.satsLast24h);

    const historyData = (data.mainSheet || []).map((row, index) => {
      const time = row.timestamp;
      const prizePoolValue = cleanNumber(row.prize_pool);
      const hashrateValue = cleanNumber(row.hashrate);
      if (!time || isNaN(new Date(time).getTime())) {
        return null;
      }
      if (prizePoolValue == null) {
        return null;
      }
      return {
        prizePool: formatNumber(prizePoolValue),
        hashrate: formatNumber(hashrateValue),
        time
      };
    }).filter(entry => entry !== null);

    const hourlyPPData = historyData; // Use full dataset

    const paymentsData = (data.paymentSheet || []).map((row, index) => {
      const time = row.timestamp;
      const paymentAmount = cleanNumber(row.sats_paid);
      if (!time || isNaN(new Date(time).getTime())) {
        return null;
      }
      if (paymentAmount == null) {
        return null;
      }
      return {
        paymentAmount: formatNumber(paymentAmount),
        time
      };
    }).filter(entry => entry !== null);

    const auctionData = (data.auctionSheet || []).map((row, index) => {
      const time = row.timestamp;
      const quantity = cleanNumber(row.quantity);
      const price = cleanNumber(row.price);
      if (!time || isNaN(new Date(time).getTime())) {
        return null;
      }
      if (quantity == null || price == null) {
        return null;
      }
      return {
        username: row.username || '',
        item: row.item || '',
        quantity: formatNumber(quantity),
        price: formatNumber(price),
        itemId: row.item_id || '',
        time
      };
    }).filter(entry => entry !== null);

    const ahHistoryData = (data.ahHistorySheet || []).map((row, index) => {
      const time = row.timestamp;
      const quantity = cleanNumber(row.quantity);
      const price = cleanNumber(row.price);
      if (!time || isNaN(new Date(time).getTime())) {
        return null;
      }
      if (quantity == null || price == null) {
        return null;
      }
      return {
        seller: row.seller || '',
        buyer: row.buyer || '',
        item: row.item || '',
        quantity: formatNumber(quantity),
        price: formatNumber(price),
        time
      };
    }).filter(entry => entry !== null);

    return {
      prizePool,
      hashrate,
      lastPaymentAmount,
      lastPaymentTime,
      totalSatsPaid,
      satsLast24h,
      asOf: new Date(data.asOf).toISOString(),
      latestAuction: {
        username: data.latestAuction.username,
        item: data.latestAuction.item,
        quantity: formatNumber(data.latestAuction.quantity),
        price: formatNumber(data.latestAuction.price),
        auctionTime: data.latestAuction.auctionTime
      },
      latestAhHistory: {
        seller: data.latestAhHistory.seller,
        buyer: data.latestAhHistory.buyer,
        item: data.latestAhHistory.item,
        quantity: formatNumber(data.latestAhHistory.quantity),
        price: formatNumber(data.latestAhHistory.price),
        ahHistoryTime: data.latestAhHistory.ahHistoryTime
      },
      historyData: JSON.stringify(historyData),
      paymentsData: JSON.stringify(paymentsData),
      hourlyPPData: JSON.stringify(hourlyPPData),
      auctionData: JSON.stringify(auctionData),
      ahHistoryData: JSON.stringify(ahHistoryData)
    };

  } catch (error) {
    console.error('Error processing data:', error.message);
    return {
      prizePool: '0',
      hashrate: '0',
      lastPaymentAmount: '0',
      lastPaymentTime: '',
      totalSatsPaid: '0',
      satsLast24h: '0',
      asOf: new Date().toISOString(),
      latestAuction: {
        username: '',
        item: '',
        quantity: '0',
        price: '0',
        auctionTime: ''
      },
      latestAhHistory: {
        seller: '',
        buyer: '',
        item: '',
        quantity: '0',
        price: '0',
        ahHistoryTime: ''
      },
      historyData: '[]',
      paymentsData: '[]',
      hourlyPPData: '[]',
      auctionData: '[]',
      ahHistoryData: '[]'
    };
  }
}

window.processData = processData;

/** Calculator variant: lighter dataset (channel, auction and auction-history rows). */
async function fetchCalculatorData() {
  try {
    const channelData = await fetchJson('get-channel-data');

    const [auctionData, ahHistoryData] = await Promise.all([
      fetchJsonOrEmpty('get-auction-data'),
      fetchJsonOrEmpty('get-ah-history')
    ]);

    const latestChannelRow = channelData.find(row => parseFloat(String(row.prize_pool).replace(/,/g, '')) > 0) || channelData[0] || {};
    const latestAuctionRow = auctionData.length > 0 ? auctionData[0] : {};
    const latestAhHistoryRow = ahHistoryData.length > 0 ? ahHistoryData[0] : {};

    const cleanNumber = (value) => {
      if (typeof value === 'string') {
        return parseFloat(value.replace(/,/g, '')) || 0;
      }
      return parseFloat(value) || 0;
    };

    const data = {
      prizePool: cleanNumber(latestChannelRow.prize_pool),
      hashrate: cleanNumber(latestChannelRow.hashrate),
      mainSheet: channelData,
      auctionSheet: auctionData,
      ahHistorySheet: ahHistoryData,
      latestAuction: {
        username: latestAuctionRow.username || '',
        item: latestAuctionRow.item || '',
        quantity: cleanNumber(latestAuctionRow.quantity),
        price: cleanNumber(latestAuctionRow.price),
        auctionTime: latestAuctionRow.timestamp || ''
      },
      latestAhHistory: {
        seller: latestAhHistoryRow.seller || '',
        buyer: latestAhHistoryRow.buyer || '',
        item: latestAhHistoryRow.item || '',
        quantity: cleanNumber(latestAhHistoryRow.quantity),
        price: cleanNumber(latestAhHistoryRow.price),
        ahHistoryTime: latestAhHistoryRow.timestamp || ''
      },
      lastUpdated: latestChannelRow.timestamp || ''
    };

    return data;

  } catch (error) {
    console.error('Error fetching calculator data:', error.message);
    return {
      prizePool: 0,
      hashrate: 0,
      mainSheet: [],
      auctionSheet: [],
      ahHistorySheet: [],
      latestAuction: {
        username: '',
        item: '',
        quantity: 0,
        price: 0,
        auctionTime: ''
      },
      latestAhHistory: {
        seller: '',
        buyer: '',
        item: '',
        quantity: 0,
        price: 0,
        ahHistoryTime: ''
      }
    };
  }
}

window.fetchCalculatorData = fetchCalculatorData;

async function processCalculatorData() {
  try {
    const data = await fetchCalculatorData();

    const cleanNumber = (value) => {
      if (typeof value === 'string') {
        const cleaned = value.replace(/,/g, '').replace(/[^0-9.-]/g, ''); // Remove non-numeric chars except . and -
        return isNaN(parseFloat(cleaned)) ? null : parseFloat(cleaned);
      }
      return parseFloat(value) || null;
    };

    const formatNumber = (value) => {
      if (value == null || value === 'N/A') return 'N/A';
      return Number(value).toLocaleString('en-US', { minimumFractionDigits: 0 });
    };

    const prizePool = formatNumber(data.prizePool);
    const hashrate = formatNumber(data.hashrate);

    const historyData = (data.mainSheet || []).map((row, index) => {
      const time = row.timestamp;
      const prizePoolValue = cleanNumber(row.prize_pool);
      const hashrateValue = cleanNumber(row.hashrate);
      if (!time || isNaN(new Date(time).getTime())) {
        return null;
      }
      if (prizePoolValue == null) {
        return null;
      }
      return {
        prizePool: formatNumber(prizePoolValue),
        hashrate: formatNumber(hashrateValue),
        time
      };
    }).filter(entry => entry !== null);

    const hourlyPPData = historyData; // Use full dataset

    const auctionData = (data.auctionSheet || []).map((row, index) => {
      const time = row.timestamp;
      const quantity = cleanNumber(row.quantity);
      const price = cleanNumber(row.price);
      if (!time || isNaN(new Date(time).getTime())) {
        return null;
      }
      if (quantity == null || price == null) {
        return null;
      }
      return {
        username: row.username || '',
        item: row.item || '',
        quantity: formatNumber(quantity),
        price: formatNumber(price),
        itemId: row.item_id || '',
        time
      };
    }).filter(entry => entry !== null);

    const ahHistoryData = (data.ahHistorySheet || []).map((row, index) => {
      const time = row.timestamp;
      const quantity = cleanNumber(row.quantity);
      const price = cleanNumber(row.price);
      if (!time || isNaN(new Date(time).getTime())) {
        return null;
      }
      if (quantity == null || price == null) {
        return null;
      }
      return {
        seller: row.seller || '',
        buyer: row.buyer || '',
        item: row.item || '',
        quantity: formatNumber(quantity),
        price: formatNumber(price),
        time
      };
    }).filter(entry => entry !== null);

    return {
      prizePool,
      hashrate,
      latestAuction: {
        username: data.latestAuction.username,
        item: data.latestAuction.item,
        quantity: formatNumber(data.latestAuction.quantity),
        price: formatNumber(data.latestAuction.price),
        auctionTime: data.latestAuction.auctionTime
      },
      latestAhHistory: {
        seller: data.latestAhHistory.seller,
        buyer: data.latestAhHistory.buyer,
        item: data.latestAhHistory.item,
        quantity: formatNumber(data.latestAhHistory.quantity),
        price: formatNumber(data.latestAhHistory.price),
        ahHistoryTime: data.latestAhHistory.ahHistoryTime
      },
      historyData: JSON.stringify(historyData),
      hourlyPPData: JSON.stringify(hourlyPPData),
      auctionData: JSON.stringify(auctionData),
      ahHistoryData: JSON.stringify(ahHistoryData)
    };

  } catch (error) {
    console.error('Error processing calculator data:', error.message);
    return {
      prizePool: '0',
      hashrate: '0',
      latestAuction: {
        username: '',
        item: '',
        quantity: '0',
        price: '0',
        auctionTime: ''
      },
      latestAhHistory: {
        seller: '',
        buyer: '',
        item: '',
        quantity: '0',
        price: '0',
        ahHistoryTime: ''
      },
      historyData: '[]',
      hourlyPPData: '[]',
      auctionData: '[]',
      ahHistoryData: '[]'
    };
  }
}

window.processCalculatorData = processCalculatorData;

/** Mean hashrate over the last `periodInDays` days. */
async function calculateAverageHashrate(periodInDays) {
  const data = await fetchData();
  const now = data.asOf;
  const startTime = now - periodInDays * 24 * 60 * 60 * 1000;
  const channelData = data.mainSheet || [];

  const recentRows = channelData.filter(row => {
    const t = new Date(row.timestamp).getTime();
    return t >= startTime && t <= now && row.hashrate !== undefined && row.hashrate !== null && row.hashrate !== '';
  });

  if (recentRows.length === 0) return 0;

  const cleanNumber = (value) => {
    if (typeof value === 'string') {
      return parseFloat(value.replace(/,/g, '')) || 0;
    }
    return parseFloat(value) || 0;
  };

  const sum = recentRows.reduce((acc, row) => acc + cleanNumber(row.hashrate), 0);
  return sum / recentRows.length;
}

window.getAverageHashrate24h = async function() {
  return calculateAverageHashrate(1); // 1 day
};

window.getAverageHashrate7d = async function() {
  return calculateAverageHashrate(7); // 7 days
};

window.getAverageHashrate30d = async function() {
  return calculateAverageHashrate(30); // 30 days
};

document.addEventListener('DOMContentLoaded', function() {
  const header = document.querySelector('.header');
  if (!header) return;
  const syncHeaderHeight = () => document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
  syncHeaderHeight();
  if (window.ResizeObserver) new ResizeObserver(syncHeaderHeight).observe(header);
  else window.addEventListener('resize', syncHeaderHeight);
});