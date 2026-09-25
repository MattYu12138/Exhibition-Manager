const STYLE_RULES = [
  { category: 'Gift Sets', family: 'Sets & Gifts', terms: ['6pc essential set', 'essential set', 'gift set', 'newborn set', 'bundle'] },
  { category: 'Zip Rompers', family: 'One-piece Essentials', terms: ['zip romper', 'zipsuit', 'zip suit'] },
  { category: 'Growsuits', family: 'One-piece Essentials', terms: ['growsuit', 'grow suit'] },
  { category: 'Long Sleeve Bodysuits', family: 'One-piece Essentials', terms: ['long sleeve bodysuit', 'long-sleeve bodysuit'] },
  { category: 'Short Sleeve Bodysuits', family: 'One-piece Essentials', terms: ['short sleeve bodysuit', 'short-sleeve bodysuit'] },
  { category: 'Singlet Bodysuits', family: 'One-piece Essentials', terms: ['singlet bodysuit', 'singlet'] },
  { category: 'Bodysuits', family: 'One-piece Essentials', terms: ['bodysuit', 'body suit', 'onesie'] },
  { category: 'Jumpsuits', family: 'One-piece Essentials', terms: ['jumpsuit'] },
  { category: 'Rompers', family: 'One-piece Essentials', terms: ['romper'] },
  { category: 'T-Shirts', family: 'Separates', terms: ['t-shirt', 't shirt', 'tee shirt'] },
  { category: 'Leggings', family: 'Separates', terms: ['leggings', 'legging'] },
  { category: 'Track Pants', family: 'Separates', terms: ['track pants', 'track pant'] },
  { category: 'Buttoned Pants', family: 'Separates', terms: ['buttoned pants', 'button pants'] },
  { category: 'Pants', family: 'Separates', terms: ['pants', 'trousers'] },
  { category: 'Shorts', family: 'Separates', terms: ['shorts'] },
  { category: 'Dresses', family: 'Dresses', terms: ['toddler dress', 'muslin dress', 'dress'] },
  { category: 'Bassinet Sheets', family: 'Sleep & Bedding', terms: ['bassinet sheet'] },
  { category: 'Cot Sheets', family: 'Sleep & Bedding', terms: ['cot sheet'] },
  { category: 'Swaddles', family: 'Sleep & Bedding', terms: ['swaddle wrap', 'swaddle'] },
  { category: 'Bedding', family: 'Sleep & Bedding', terms: ['bedding', 'sheet'] },
  { category: 'Burp Cloths', family: 'Accessories', terms: ['burp cloth'] },
  { category: 'Sun Hats', family: 'Accessories', terms: ['bucket sun hat', 'sun hat'] },
  { category: 'Beanies', family: 'Accessories', terms: ['beanie'] },
  { category: 'Headbands', family: 'Accessories', terms: ['headband'] },
  { category: 'Baby Socks', family: 'Accessories', terms: ['baby socks', 'socks', 'sock'] },
  { category: 'Bibs', family: 'Accessories', terms: ['baby bib', 'muslin bib', 'round bib', 'triangle bib', 'bib'] },
  { category: 'Accessories', family: 'Accessories', terms: ['accessories', 'accessory'] },
]

const GENERIC_PRODUCT_TYPES = new Set(['', 'babywear', 'apparel', 'clothing', 'accessories', 'other'])
const BROAD_STYLE_CATEGORIES = new Set(['Accessories', 'Bedding', 'Bodysuits', 'Pants', 'Rompers'])
const SIZE_ORDER = [
  'Newborn', '0–3 months', '3–6 months', '6–12 months', '12–18 months',
  '18–24 months', '2–3 years', '3–4 years', '4+ years', 'One size', 'Other sizes',
]

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9+\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleCase(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function parseTags(value) {
  if (Array.isArray(value)) return value.map(String).map(tag => tag.trim()).filter(Boolean)
  const text = String(value || '').trim()
  if (!text) return []
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed.map(String).map(tag => tag.trim()).filter(Boolean)
    } catch (_) {
      // Fall back to Shopify's comma-separated tag format.
    }
  }
  return text.split(',').map(tag => tag.trim()).filter(Boolean)
}

function splitKeywords(keyword) {
  return String(keyword || '')
    .split(/[|,;]/)
    .map(normalize)
    .filter(Boolean)
}

function includesTerm(haystack, term) {
  const normalizedTerm = normalize(term)
  if (!normalizedTerm) return false
  return haystack.includes(normalizedTerm)
}

function canonicalStyleFromType(productType) {
  const normalizedType = normalize(productType)
  if (!normalizedType || GENERIC_PRODUCT_TYPES.has(normalizedType)) return null
  const rule = STYLE_RULES.find(item => item.terms.some(term => includesTerm(normalizedType, term)))
  if (rule) return { category: rule.category, family: rule.family }
  return { category: titleCase(productType), family: 'Other' }
}

function buildClassifier(categoryRules = []) {
  const managedStyleRules = categoryRules
    .filter(rule => rule.type === 'style')
    .flatMap(rule => splitKeywords(rule.keyword).map(keyword => {
      const canonical = STYLE_RULES.find(item => item.terms.some(term => (
        includesTerm(normalize(`${rule.name} ${keyword}`), term)
      )))
      return {
        category: canonical?.category || rule.name,
        family: canonical?.family,
        keyword,
        sortOrder: Number(rule.sort_order || 0),
        source: 'managed_rule',
      }
    }))
  const builtInStyleRules = STYLE_RULES.flatMap(rule => rule.terms.map(keyword => ({
    category: rule.category,
    family: rule.family,
    keyword: normalize(keyword),
    sortOrder: 999,
    source: 'title_or_tag',
  })))
  const styleRules = [...managedStyleRules, ...builtInStyleRules]
    .sort((a, b) => {
      const broadDifference = Number(BROAD_STYLE_CATEGORIES.has(a.category)) - Number(BROAD_STYLE_CATEGORIES.has(b.category))
      return broadDifference || b.keyword.length - a.keyword.length || a.sortOrder - b.sortOrder || (a.source === 'managed_rule' ? -1 : 1)
    })

  const managedMaterialRules = categoryRules
    .filter(rule => rule.type === 'material')
    .flatMap(rule => splitKeywords(rule.keyword).map(keyword => ({
      category: rule.name,
      keyword,
      sortOrder: Number(rule.sort_order || 0),
    })))
    .sort((a, b) => a.sortOrder - b.sortOrder || b.keyword.length - a.keyword.length)

  return function classifyProduct(product = {}) {
    const title = String(product.title || product.product_title || '').trim()
    const productType = String(product.product_type || '').trim()
    const tags = parseTags(product.tags)
    const titleAndTags = normalize([title, ...tags].join(' | '))
    const allText = normalize([title, ...tags, productType].join(' | '))

    const matchedStyle = styleRules.find(rule => includesTerm(titleAndTags, rule.keyword))
    let style
    let styleSource
    if (matchedStyle) {
      style = matchedStyle.category
      styleSource = matchedStyle.source
    } else {
      const builtIn = STYLE_RULES.find(rule => rule.terms.some(term => includesTerm(titleAndTags, term)))
      if (builtIn) {
        style = builtIn.category
        styleSource = 'title_or_tag'
      } else {
        const fromType = canonicalStyleFromType(productType)
        style = fromType?.category || 'Unclassified'
        styleSource = fromType ? 'shopify_type' : 'unclassified'
      }
    }

    const styleSearch = normalize(`${style} ${matchedStyle?.keyword || ''}`)
    const builtInFamily = STYLE_RULES.find(rule => (
      rule.category === style || rule.terms.some(term => includesTerm(styleSearch, term))
    ))?.family
    const family = matchedStyle?.family || builtInFamily || canonicalStyleFromType(productType)?.family || (style === 'Unclassified' ? 'Unclassified' : 'Other')

    const managedMaterial = managedMaterialRules.find(rule => includesTerm(allText, rule.keyword))
    let material
    if (includesTerm(allText, 'bamboo')) material = 'Bamboo'
    else if (includesTerm(allText, 'muslin')) material = 'Muslin'
    else if (includesTerm(allText, 'waffle')) material = 'Waffle Cotton'
    else if (managedMaterial) material = managedMaterial.category
    else if (includesTerm(allText, 'organic cotton')) material = 'Organic Cotton'
    else if (includesTerm(allText, 'cotton')) material = 'Cotton'
    else material = 'Other Material'

    const seasonTag = tags.find(tag => /^season\s*:/i.test(tag))
    let collection = seasonTag ? seasonTag.replace(/^season\s*:\s*/i, '').replace(/\s+collection$/i, '').trim() : ''
    if (!collection) collection = 'Core / Unassigned'
    collection = titleCase(collection)

    const genderTag = tags.find(tag => /^gender\s*:/i.test(tag))
    let gender = genderTag ? genderTag.replace(/^gender\s*:\s*/i, '').trim() : ''
    if (!gender) {
      const normalizedTags = tags.map(normalize)
      if (normalizedTags.includes('unisex')) gender = 'Unisex'
      else if (normalizedTags.includes('girl')) gender = 'Girl'
      else if (normalizedTags.includes('boy')) gender = 'Boy'
      else gender = 'Unspecified'
    }
    gender = titleCase(gender)

    const normalizedType = normalize(productType)
    const canonicalType = canonicalStyleFromType(productType)
    const typeMismatch = Boolean(
      canonicalType &&
      !GENERIC_PRODUCT_TYPES.has(normalizedType) &&
      canonicalType.category !== style &&
      !(BROAD_STYLE_CATEGORIES.has(canonicalType.category) && canonicalType.family === family) &&
      styleSource !== 'shopify_type'
    )

    return {
      style,
      family,
      material,
      collection,
      gender,
      style_source: styleSource,
      type_mismatch: typeMismatch,
      original_product_type: productType,
    }
  }
}

function classifySize(value) {
  const raw = String(value || '').trim()
  const text = normalize(raw)
  if (!text) return 'Other sizes'
  if (/\b0000\b/.test(text) || /newborn|0\s*-\s*3\s*weeks/.test(text)) return 'Newborn'
  if (/\b000\b/.test(text) || /0\s*-\s*3\s*months?/.test(text)) return '0–3 months'
  if (/\b00\b/.test(text) || /3\s*-\s*6\s*months?/.test(text)) return '3–6 months'
  if (/^0\b/.test(text) || /6\s*-\s*12\s*months?/.test(text)) return '6–12 months'
  if (/^1\b/.test(text) || /12\s*-\s*18\s*months?/.test(text)) return '12–18 months'
  if (/^2\b/.test(text) || /18\s*-\s*24\s*months?/.test(text)) return '18–24 months'
  if (/2\s*-\s*3\s*years?|\b2y\b/.test(text)) return '2–3 years'
  if (/3\s*-\s*4\s*years?|\b3y\b/.test(text)) return '3–4 years'
  if (/one size|osfa|single size/.test(text)) return 'One size'
  return 'Other sizes'
}

function marketFromEvent(event = {}) {
  const name = String(event.name || event.exhibition_name || '')
  const location = String(event.location || '')
  const text = normalize(`${name} ${location}`)
  if (/\bmel\b|melbourne/.test(text)) return 'Melbourne'
  if (/\bsyd\b|sydney/.test(text)) return 'Sydney'
  if (/\bbris\b|brisbane/.test(text)) return 'Brisbane'
  if (/\badel\b|adelaide/.test(text)) return 'Adelaide'
  if (/\bperth\b/.test(text)) return 'Perth'
  if (/\bgold coast\b/.test(text)) return 'Gold Coast'
  if (/\bcanberra\b/.test(text)) return 'Canberra'
  const prefix = name.split(/\s+-\s+/)[0]?.trim()
  return prefix || location || 'Other Market'
}

function formatFromEvent(event = {}) {
  const text = normalize(event.name || event.exhibition_name || '')
  if (/\bpbc\b/.test(text)) return 'PBC'
  if (/\bofb\b/.test(text)) return 'OFB'
  return 'Other'
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value) {
  const parsed = parseFloat(String(value || '').replace(/[^0-9.-]/g, ''))
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return parsed
}

function round(value, digits = 1) {
  const factor = 10 ** digits
  return Math.round((Number(value) || 0) * factor) / factor
}

function percent(numerator, denominator) {
  return denominator > 0 ? round((numerator / denominator) * 100, 1) : null
}

function deltaPercent(current, previous) {
  if (!previous) return null
  return round(((current - previous) / previous) * 100, 1)
}

function createAggregate(key, label = key) {
  return {
    key,
    label,
    sold: 0,
    allocated: 0,
    remaining: 0,
    revenue: 0,
    rows: 0,
    products: new Set(),
    variants: new Set(),
    exhibitions: new Set(),
    eventSales: new Map(),
    eventAllocations: new Map(),
  }
}

function addToAggregate(aggregate, row) {
  aggregate.sold += row.sold
  aggregate.allocated += row.allocated
  aggregate.remaining += row.remaining
  aggregate.revenue += row.revenue
  aggregate.rows += 1
  aggregate.products.add(row.product_key)
  aggregate.variants.add(row.variant_key)
  aggregate.exhibitions.add(row.exhibition_id)
  aggregate.eventSales.set(row.exhibition_id, (aggregate.eventSales.get(row.exhibition_id) || 0) + row.sold)
  aggregate.eventAllocations.set(row.exhibition_id, (aggregate.eventAllocations.get(row.exhibition_id) || 0) + row.allocated)
}

function trendForAggregate(aggregate, orderedEventIds) {
  const offeredEventIds = orderedEventIds.filter(id => (aggregate.eventAllocations.get(id) || 0) > 0)
  if (offeredEventIds.length < 2) return null
  const split = Math.max(1, Math.floor(offeredEventIds.length / 2))
  const earlierIds = offeredEventIds.slice(0, split)
  const recentIds = offeredEventIds.slice(split)
  if (!recentIds.length) return null
  const average = ids => ids.reduce((sum, id) => sum + (aggregate.eventSales.get(id) || 0), 0) / ids.length
  return deltaPercent(average(recentIds), average(earlierIds))
}

function finalizeAggregate(aggregate, totalSold, orderedEventIds) {
  return {
    key: aggregate.key,
    label: aggregate.label,
    sold: round(aggregate.sold, 0),
    allocated: round(aggregate.allocated, 0),
    remaining: round(aggregate.remaining, 0),
    revenue: round(aggregate.revenue, 2),
    sell_through: percent(aggregate.sold, aggregate.allocated),
    sales_share: percent(aggregate.sold, totalSold),
    product_count: aggregate.products.size,
    variant_count: aggregate.variants.size,
    exhibition_count: aggregate.exhibitions.size,
    trend_pct: trendForAggregate(aggregate, orderedEventIds),
  }
}

function groupRows(rows, keySelector, labelSelector, totalSold, orderedEventIds) {
  const groups = new Map()
  for (const row of rows) {
    const key = keySelector(row)
    if (!groups.has(key)) groups.set(key, createAggregate(key, labelSelector(row)))
    addToAggregate(groups.get(key), row)
  }
  return [...groups.values()]
    .map(group => finalizeAggregate(group, totalSold, orderedEventIds))
    .sort((a, b) => b.sold - a.sold || b.revenue - a.revenue)
}

function buildDashboard({ rows = [], events = [], categoryRules = [], catalogProducts = [], exhibitionId = '' }) {
  const classifier = buildClassifier(categoryRules)
  const completedEvents = events
    .filter(event => event.status === 'completed')
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  const selectedEvent = exhibitionId ? completedEvents.find(event => event.id === exhibitionId) : null
  const scopedEvents = selectedEvent ? [selectedEvent] : completedEvents
  const scopedEventIds = new Set(scopedEvents.map(event => event.id))
  const orderedEventIds = scopedEvents.map(event => event.id)
  // A before-sync snapshot has no final Square count yet. Excluding it prevents
  // an active/incomplete event from appearing as zero sales in decision reports.
  const finalizedRows = rows.filter(row => Boolean(row.after_synced_at))

  const classifiedRows = finalizedRows
    .filter(row => scopedEventIds.has(row.exhibition_id))
    .map(row => {
      const classification = classifier(row)
      const sold = Math.max(0, number(row.sold_quantity))
      const remaining = Math.max(0, number(row.remaining_quantity))
      const allocated = Math.max(0, number(row.allocated_quantity ?? (sold + remaining)))
      const unitPrice = money(row.price)
      const productKey = row.product_id || row.product_title || row.shopify_variant_id || 'unknown-product'
      const variantKey = row.shopify_variant_id || row.variant_id || `${productKey}:${row.variant_title || ''}`
      return {
        ...row,
        ...classification,
        sold,
        allocated,
        remaining,
        unit_price: unitPrice,
        revenue: sold * unitPrice,
        product_key: String(productKey),
        variant_key: String(variantKey),
        size_band: classifySize(row.variant_title),
        market: marketFromEvent(row),
        event_format: formatFromEvent(row),
      }
    })

  const totalSold = classifiedRows.reduce((sum, row) => sum + row.sold, 0)
  const totalAllocated = classifiedRows.reduce((sum, row) => sum + row.allocated, 0)
  const totalRevenue = classifiedRows.reduce((sum, row) => sum + row.revenue, 0)
  const distinctProducts = new Map()
  for (const row of classifiedRows) {
    if (!distinctProducts.has(row.product_key)) distinctProducts.set(row.product_key, row)
  }
  const soldProducts = [...distinctProducts.values()]
  const catalogClassified = (catalogProducts.length ? catalogProducts : soldProducts).map(product => ({
    ...product,
    ...classifier(product),
    product_key: String(product.product_id || product.product_title || 'unknown-product'),
  }))
  const unclassifiedProducts = catalogClassified.filter(row => row.style === 'Unclassified')
  const recoveredProducts = catalogClassified.filter(row => !row.original_product_type && row.style !== 'Unclassified')
  const typeMismatches = catalogClassified.filter(row => row.type_mismatch)

  const eventGroups = new Map(completedEvents.map(event => [event.id, {
    id: event.id,
    name: event.name,
    date: event.date,
    location: event.location,
    market: marketFromEvent(event),
    event_format: formatFromEvent(event),
    sold: 0,
    allocated: 0,
    remaining: 0,
    revenue: 0,
    variants: new Set(),
    categories: new Map(),
  }]))
  for (const row of finalizedRows.map(raw => {
    const classification = classifier(raw)
    const sold = Math.max(0, number(raw.sold_quantity))
    const remaining = Math.max(0, number(raw.remaining_quantity))
    const allocated = Math.max(0, number(raw.allocated_quantity ?? (sold + remaining)))
    return {
      ...raw,
      ...classification,
      sold,
      allocated,
      remaining,
      revenue: sold * money(raw.price),
      variant_key: String(raw.shopify_variant_id || raw.variant_id || ''),
    }
  })) {
    const aggregate = eventGroups.get(row.exhibition_id)
    if (!aggregate) continue
    aggregate.sold += row.sold
    aggregate.allocated += row.allocated
    aggregate.remaining += row.remaining
    aggregate.revenue += row.revenue
    aggregate.variants.add(row.variant_key)
    aggregate.categories.set(row.style, (aggregate.categories.get(row.style) || 0) + row.sold)
  }

  const trend = completedEvents.map(event => {
    const aggregate = eventGroups.get(event.id)
    const bestCategory = [...aggregate.categories.entries()].sort((a, b) => b[1] - a[1])[0]
    return {
      id: aggregate.id,
      name: aggregate.name,
      date: aggregate.date,
      location: aggregate.location,
      market: aggregate.market,
      event_format: aggregate.event_format,
      sold: round(aggregate.sold, 0),
      allocated: round(aggregate.allocated, 0),
      remaining: round(aggregate.remaining, 0),
      revenue: round(aggregate.revenue, 2),
      sell_through: percent(aggregate.sold, aggregate.allocated),
      variant_count: aggregate.variants.size,
      best_category: bestCategory?.[0] || '—',
    }
  })

  const categories = groupRows(classifiedRows, row => row.style, row => row.style, totalSold, orderedEventIds)
  const families = groupRows(classifiedRows, row => row.family, row => row.family, totalSold, orderedEventIds)
  const collections = groupRows(classifiedRows, row => row.collection, row => row.collection, totalSold, orderedEventIds)
  const materials = groupRows(classifiedRows, row => row.material, row => row.material, totalSold, orderedEventIds)
  const genders = groupRows(classifiedRows, row => row.gender, row => row.gender, totalSold, orderedEventIds)
  const sizes = groupRows(classifiedRows, row => row.size_band, row => row.size_band, totalSold, orderedEventIds)
    .sort((a, b) => SIZE_ORDER.indexOf(a.key) - SIZE_ORDER.indexOf(b.key))
  const markets = groupRows(classifiedRows, row => row.market, row => row.market, totalSold, orderedEventIds)
    .map(row => ({ ...row, sold_per_event: round(row.sold / Math.max(row.exhibition_count, 1), 1) }))
  const eventFormats = groupRows(classifiedRows, row => row.event_format, row => row.event_format, totalSold, orderedEventIds)
    .map(row => ({ ...row, sold_per_event: round(row.sold / Math.max(row.exhibition_count, 1), 1) }))

  const productGroups = new Map()
  for (const row of classifiedRows) {
    if (!productGroups.has(row.product_key)) {
      productGroups.set(row.product_key, {
        ...createAggregate(row.product_key, row.product_title || 'Unknown product'),
        category: row.style,
        family: row.family,
        material: row.material,
        collection: row.collection,
        eventSequence: new Map(),
      })
    }
    const aggregate = productGroups.get(row.product_key)
    addToAggregate(aggregate, row)
    aggregate.eventSequence.set(row.exhibition_id, (aggregate.eventSequence.get(row.exhibition_id) || 0) + row.sold)
  }

  const demandSignals = [...productGroups.values()].map(group => {
    const final = finalizeAggregate(group, totalSold, orderedEventIds)
    const eventCount = Math.max(final.exhibition_count, 1)
    const averageSold = group.sold / eventCount
    const averageAllocated = group.allocated / eventCount
    const offeredEventIds = orderedEventIds.filter(id => (group.eventAllocations.get(id) || 0) > 0)
    const recentIds = offeredEventIds.slice(-3)
    const weights = recentIds.map((_, index) => index + 1)
    const weightedSold = recentIds.length
      ? recentIds.reduce((sum, id, index) => sum + (group.eventSequence.get(id) || 0) * weights[index], 0) /
        weights.reduce((sum, weight) => sum + weight, 0)
      : averageSold
    const sampleSufficient = final.exhibition_count >= 2 && group.allocated >= 10
    const recommendation = sampleSufficient ? Math.max(1, Math.ceil(weightedSold / 0.7)) : null
    let signal = 'insufficient'
    if (sampleSufficient) {
      signal = 'steady'
      if ((final.sell_through || 0) >= 65 && averageSold >= 2) signal = 'scale'
      else if ((final.sell_through || 0) < 25 && averageAllocated >= 5) signal = 'reduce'
      else if ((final.trend_pct || 0) >= 25) signal = 'rising'
    }
    return {
      product_key: group.key,
      product_title: group.label,
      category: group.category,
      family: group.family,
      material: group.material,
      collection: group.collection,
      sold: final.sold,
      allocated: final.allocated,
      revenue: final.revenue,
      sell_through: final.sell_through,
      exhibition_count: final.exhibition_count,
      average_sold: round(averageSold, 1),
      trend_pct: final.trend_pct,
      recommended_units: recommendation,
      sample_sufficient: sampleSufficient,
      signal,
    }
  }).sort((a, b) => b.sold - a.sold || (b.sell_through || 0) - (a.sell_through || 0))

  const scopedTrend = trend.filter(event => scopedEventIds.has(event.id))
  const current = selectedEvent ? trend.find(event => event.id === selectedEvent.id) : trend.at(-1)
  const currentIndex = current ? trend.findIndex(event => event.id === current.id) : -1
  const previous = currentIndex > 0 ? trend[currentIndex - 1] : null

  const qualityIssues = new Map(catalogClassified.map(product => [product.product_key, {
    product_key: product.product_key,
    product_title: product.product_title || 'Unknown product',
    shopify_product_type: product.original_product_type || '',
    inferred_category: product.style,
    sold: 0,
    exhibitions: new Set(),
    reasons: new Set([
      ...(product.style === 'Unclassified' ? ['unclassified'] : []),
      ...(product.type_mismatch ? ['type_mismatch'] : []),
    ]),
  }]))
  for (const row of classifiedRows) {
    if (!qualityIssues.has(row.product_key)) {
      qualityIssues.set(row.product_key, {
        product_key: row.product_key,
        product_title: row.product_title || 'Unknown product',
        shopify_product_type: row.original_product_type || '',
        inferred_category: row.style,
        sold: 0,
        exhibitions: new Set(),
        reasons: new Set(),
      })
    }
    const issue = qualityIssues.get(row.product_key)
    issue.sold += row.sold
    issue.exhibitions.add(row.exhibition_id)
    if (row.style === 'Unclassified') issue.reasons.add('unclassified')
    if (row.type_mismatch) issue.reasons.add('type_mismatch')
    if (!row.product_id) issue.reasons.add('missing_product_match')
    if (row.sold > row.allocated && row.allocated > 0) issue.reasons.add('sold_above_plan')
    if (Math.abs(row.allocated - row.sold - row.remaining) > 0.001) issue.reasons.add('snapshot_mismatch')
    if (row.unit_price <= 0) issue.reasons.add('missing_price')
  }

  const issues = [...qualityIssues.values()]
    .filter(item => item.reasons.size > 0)
    .map(item => ({
      ...item,
      sold: round(item.sold, 0),
      exhibition_count: item.exhibitions.size,
      exhibitions: undefined,
      reasons: [...item.reasons],
    }))
    .sort((a, b) => {
      const priority = reason => reason.includes('unclassified') ? 0 : reason.includes('missing_product_match') ? 1 : 2
      return priority(a.reasons) - priority(b.reasons) || b.sold - a.sold
    })

  return {
    scope: {
      exhibition_id: selectedEvent?.id || null,
      exhibition_name: selectedEvent?.name || '全部已完成展会',
      completed_exhibitions: completedEvents.map(event => ({
        id: event.id,
        name: event.name,
        date: event.date,
        location: event.location,
      })).reverse(),
    },
    kpis: {
      units_sold: round(totalSold, 0),
      allocated_units: round(totalAllocated, 0),
      sell_through: percent(totalSold, totalAllocated),
      estimated_revenue: round(totalRevenue, 2),
      average_selling_price: totalSold > 0 ? round(totalRevenue / totalSold, 2) : 0,
      average_units_per_event: scopedEvents.length ? round(totalSold / scopedEvents.length, 1) : 0,
      exhibition_count: scopedEvents.length,
      classification_coverage: catalogClassified.length ? round(((catalogClassified.length - unclassifiedProducts.length) / catalogClassified.length) * 100, 1) : 100,
      classified_products: catalogClassified.length - unclassifiedProducts.length,
      unclassified_products: unclassifiedProducts.length,
      recovered_products: recoveredProducts.length,
    },
    comparison: current ? {
      current_event: current.name,
      previous_event: previous?.name || null,
      units_delta_pct: previous ? deltaPercent(current.sold, previous.sold) : null,
      sell_through_delta_pp: previous && current.sell_through !== null && previous.sell_through !== null
        ? round(current.sell_through - previous.sell_through, 1)
        : null,
      revenue_delta_pct: previous ? deltaPercent(current.revenue, previous.revenue) : null,
      best_category: current.best_category,
    } : null,
    trend: selectedEvent ? scopedTrend : trend,
    categories,
    families,
    collections,
    materials,
    genders,
    sizes,
    markets,
    event_formats: eventFormats,
    demand_signals: demandSignals.slice(0, 30),
    quality: {
      source_product_count: catalogClassified.length,
      missing_shopify_type: catalogClassified.filter(row => !row.original_product_type).length,
      recovered_from_missing_type: recoveredProducts.length,
      unclassified_count: unclassifiedProducts.length,
      type_mismatch_count: typeMismatches.length,
      missing_product_matches: classifiedRows.filter(row => !row.product_id).length,
      issues: issues.slice(0, 50),
    },
  }
}

module.exports = {
  STYLE_RULES,
  SIZE_ORDER,
  buildClassifier,
  classifySize,
  marketFromEvent,
  formatFromEvent,
  buildDashboard,
}
