// Vercel Speed Insights integration
// Import and initialize Speed Insights for vanilla JavaScript
import { injectSpeedInsights } from '@vercel/speed-insights';

// Initialize Speed Insights
injectSpeedInsights({
  debug: false, // Set to true for development debugging
});
