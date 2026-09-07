import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { BoltIcon } from '@heroicons/react/16/solid'
import { Button, IconCheckOutline16, IconChevronDownOutline14, IconChevronRightOutline14, Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { buildImageEditDraft } from './image-edit.js'
import { createAnnotatedImageReference } from './image-edit-reference.js'
import { decodeImagePresentation, decodeOriginalImageRef, ORIGINAL_IMAGE_CHUNK_BYTES } from './image-original-contract.js'
import { SubscriptionImageViewerOverlay } from './subscription-image-viewer.jsx'
import { SUBSCRIPTION_IMAGE_VIEWER_CSS } from './subscription-image-viewer-styles.js'
import { SubscriptionImageViewerService } from './subscription-image-viewer.js'
import {
  CONTEXT_MODE_CUSTOM,
  CONTEXT_MODE_EXTENDED,
  CONTEXT_MODE_FIELD,
  CONTEXT_MODE_STANDARD,
  CUSTOM_CONTEXT_MODEL_CAPS,
  CUSTOM_CONTEXT_MODEL_DEFAULTS,
  CUSTOM_CONTEXT_MODEL_FIELDS,
  CUSTOM_CONTEXT_WINDOW_FIELD,
  MIN_CUSTOM_CONTEXT_WINDOW,
  LEGACY_QUICK_QUOTA_FIELD,
  normalizeContextMode,
  normalizeCustomContextWindow,
  formatContextWindow,
  normalizeQuickQuotaMode,
  normalizeOutputVerbosity,
  normalizeSpeedMode,
  normalizeSearchProvider,
  parseContextWindow,
  QUICK_QUOTA_MODE_BAR,
  QUICK_QUOTA_MODE_FORECAST,
  QUICK_QUOTA_MODE_FIELD,
  QUICK_QUOTA_MODE_OFF,
  QUICK_QUOTA_MODE_PERCENT,
  OUTPUT_VERBOSITY_DEFAULT,
  OUTPUT_VERBOSITY_FIELD,
  OUTPUT_VERBOSITY_HIGH,
  OUTPUT_VERBOSITY_LOW,
  OUTPUT_VERBOSITY_MEDIUM,
  SEARCH_PROVIDER_AUTO,
  SEARCH_PROVIDER_CODEX,
  SEARCH_PROVIDER_DSH,
  SEARCH_PROVIDER_FIELD,
  SETTINGS_NAMESPACE,
  SPEED_MODE_FAST,
  SPEED_MODE_FIELD,
  SPEED_MODE_STANDARD,
  supportsCodexFastMode,
} from './settings-contract.js'
import { selectModelQuotaWindows } from './sidebar-quota.js'
import { readLoginProgress } from './login-progress.js'
import { createPreferenceController } from './preference-controller.js'
import { createAccountStatusController } from './account-status-controller.js'
import { reconcileContextDrafts } from './context-draft-state.js'

export const inject = [
  'slots', 'locale', 'connection', 'remote', 'settingsScope', 'modelDirectories', 'conversation', 'uiConversation', 'sessions',
]

const NS = 'settings.codexSubscription'
const CHANNEL = '/codex-subscription'
const SUPPORT_ISSUE_URL = 'https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml'
const QUICK_QUOTA_REFRESH_EVENT = 'dsh-codex-subscription:refresh-quick-quota'
const QUICK_QUOTA_REFRESH_MS = 60_000

const en = {
  imageEditLocation: 'Location',
  imageEditReferenceGuide: 'The clean source for this edit is "{sourceName}"; "{referenceName}" is the numbered location reference. Coordinates start at the top-left, x increases rightward and y downward; percentages refer to the whole image. Inspect both images and pass both as references to the image-editing tool. Preserve every number, position and requested change below in the tool prompt. Edit the corresponding content in the clean source; numbers, dots and leader lines on the location reference are guidance only and must not appear in the final result. If either image cannot be read or a location is unclear, explain the problem instead of guessing or ignoring annotations.',
  nav: 'Codex',
  title: 'Codex Subscription',
  connected: 'Signed in', disconnected: 'Not signed in', accountLoading: 'Reading account status…',
  browserLogin: 'Browser Sign-in', deviceLogin: 'Device-code Sign-in', logout: 'Sign out',
  addAccount: 'Add Account', switchAccount: 'Switch', removeAccount: 'Remove', removeConfirm: 'Confirm remove', removeCancel: 'Keep', signOutAll: 'Sign out all',
  cancel: 'Cancel', submit: 'Submit authorization code', openLogin: 'Open sign-in page',
  manualCode: 'If the browser callback did not finish automatically, paste the code or full redirect URL.',
  deviceHint: 'Enter this device code on the sign-in page:', waiting: 'Waiting for sign-in to finish…',
  failed: 'Sign-in failed. Try again.', loadFailed: 'Could not read account status.', accountRetry: 'Retry', accountRetrying: 'Retrying account status…', accountCredentialUnavailable: 'The saved sign-in credentials are temporarily unavailable. Retry; saved sign-in information will not be deleted.', accountCredentialMalformed: 'The saved sign-in credentials are malformed, so account status cannot be read. Retrying will not delete saved sign-in information.', accountStatusTimeout: 'Reading account status timed out. Retry.', accountStatusTransport: 'The account service is unavailable. Check the connection and retry.', accountStatusUnknown: 'Could not read account status. Retry.',
  diagnostics: 'Support diagnostics', diagnosticsLoad: 'Create report', diagnosticsLoading: 'Creating…', diagnosticsCopy: 'Copy report', diagnosticsCopied: 'Copied', diagnosticsFailed: 'Could not create diagnostics.', feedbackOpen: 'Report a problem',
  showEmail: 'Show full email', hideEmail: 'Hide email', emailUnavailable: 'Email unavailable',
  searchTitle: 'Search Source',
  searchScope: 'Auto follows the current session model; an explicit choice overrides every model and session.',
  searchAuto: 'Auto', searchAutoHint: 'Codex models use subscription search; other models use DSH default',
  searchDsh: 'DSH Default', searchDshHint: 'Use DSH\'s current search service for every model',
  searchCodex: 'Codex Subscription', searchCodexHint: 'Search through the signed-in ChatGPT subscription for every model',
  preferenceFailed: 'The setting was not saved.', preferenceRetry: 'Retry',
  usage: 'Subscription Quota',
  refresh: 'Refresh', refreshing: 'Refreshing…', noUsage: 'Sign in to read quota windows reported by ChatGPT.',
  usageLoading: 'Reading quota…', usageEmpty: 'Current account returned no visible quota windows. Please refresh shortly.',
  usageUpdated: 'Updated at {value}', remaining: '{value}% remaining',
  windowFiveHours: '5-Hour Quota', windowDaily: 'Daily Quota', windowWeekly: 'Weekly Quota', windowMonthly: 'Monthly Quota', windowAnnual: 'Annual Quota',
  windowHours: '{value}h Quota', windowDays: '{value}d Quota', resets: 'Resets at {value}', resetUnknown: 'Reset time unavailable',
  creditsBalance: 'Extra Credits Balance', creditsUnit: 'credits', unlimited: 'Unlimited', monthlyCreditLimit: 'Monthly Credits Limit',
  resetCredits: 'Quota Resets', resetCreditDefaultName: 'Quota Reset',
  resetUse: 'Use',
  resetPreparing: 'Preparing…', resetConfirmTitle: 'Confirm Quota Reset',
  resetWarning: 'This action will consume 1 reset credit and cannot be undone.', resetEarlyWarning: 'Quota is not depleted yet; the service may not perform a reset.',
  resetAcknowledge: 'I acknowledge that this action will immediately consume 1 reset', resetCreditExpires: 'Expires: {value}', resetCreditExpiryUnknown: 'Expiry time unavailable', resetCreditExpiryLoading: 'Reading expiry time…', resetCreditExpiryFailed: 'Could not read expiry time',
  resetWait: 'Please wait {count}s', resetFinal: 'Confirm Use', resetUsing: 'Resetting…',
  resetSuccess: 'Quota reset completed successfully.', resetNothing: 'No quota to reset at this moment; no reset credit was consumed.',
  resetNoCredit: 'No quota reset credits available.', resetAlready: 'This reset request was already processed.', resetFailed: 'Could not use quota reset.',
  resetRenewLogin: 'Session expired. Please sign in again.', resetExpired: 'Confirmation expired. Please restart the operation.',
  resetInProgress: 'Quota reset is currently in progress.', resetTooEarly: 'Please wait until cooldown ends before confirming.', resetAcknowledgeRequired: 'Please confirm that you acknowledge consuming a reset credit.',
  resetAccountChanged: 'Active account changed. Please restart.',
  resetUncertain: 'Service returned an uncertain result. The plugin will safely retry without duplicating.',
  creditsNote: 'Extra credits, monthly limits, and reset counts are displayed separately.',
  creditsUsed: '{used} / {limit} credits used', spendReached: 'Monthly credit spending limit reached.', unavailable: 'No data',
  quickQuotaSetting: 'Composer Quota Indicator', quickQuotaOff: 'Off', quickQuotaPercent: 'Percentage', quickQuotaBar: 'Progress Bar', quickQuotaForecast: 'Runway Forecast', quickQuotaBeta: 'Beta',
  quickQuotaForecastHint: 'Adaptive burn rate calibration. High usage estimates within 5-10m; steady usage shows stable status.',
  contextTitle: 'Context Window', contextStandard: 'Standard', contextStandardHint: 'Use model defaults; official agent presets manage compaction automatically.',
  contextExtended: 'Extended', contextExtendedHint: 'Use verified extended token budget per model (up to 872K+); subject to backend support.',
  contextCustom: 'Custom', contextCustomHint: 'Specify custom token limit; lower values trigger earlier compaction.', contextTokens: 'Token Limit', contextFixed: 'Fixed {value}', contextMaximum: 'Range 128000–{value}',
  quickQuotaStatus: 'Codex {value}% remaining',
  quickQuotaForecastStatus: 'Codex {value}% remaining, ~{duration} at current pace',
  quickQuotaForecastCalibrating: 'Calibrating', quickQuotaForecastCalibratingStatus: 'Codex {value}% remaining, calibrating forecast',
  quickQuotaForecastIdle: 'Stable', quickQuotaForecastIdleStatus: 'Codex {value}% remaining, stable usage',
  quickQuotaForecastUntilReset: 'Good until reset', quickQuotaForecastUntilResetStatus: 'Codex {value}% remaining, sufficient until reset',
  quotaForecast: 'At current pace: {symbol}{duration}',
  quotaForecastCalibrating: 'Runway calibrating', quotaForecastIdle: 'Usage currently stable', quotaForecastUntilReset: 'Enough until reset at current pace',
  runwayDaysHours: '{days}d {hours}h', runwayDays: '{days}d', runwayHours: '{hours}h', runwayMinutes: '{minutes}m',
  speedTitle: 'Speed Mode', speedStandard: 'Standard', speedStandardHint: 'Standard response speed',
  speedFast: 'Fast', speedFastHint: '1.5x speed (higher credit usage)',
  verbosityTitle: 'Output Detail', verbosityDefault: 'Default', verbosityDefaultHint: 'Use catalog recommendation', verbosityLow: 'Concise', verbosityLowHint: 'Brief and direct', verbosityMedium: 'Balanced', verbosityMediumHint: 'Balanced depth and brevity', verbosityHigh: 'Detailed', verbosityHighHint: 'Comprehensive structure and depth',
  modelMenuAria: 'Model, effort, speed, and output detail', modelLabel: 'Model', effortLabel: 'Effort', providerDefault: 'Default', selectModel: 'Select Model',
  modelsLoading: 'Loading models…', modelsEmpty: 'No models available.', effortsEmpty: 'No reasoning effort levels for this model.', modelRetry: 'Retry', modelDirectoryFailed: 'Could not load model directory. Try again.', modelFailed: 'Could not load models: {value}', groupFailed: '{name}: {value}',
  imageGenerate: 'Generate Image', imageBeta: 'Beta', imageGenerating: 'Generating…', imageGenerated: 'Generated', imageFailed: 'Generation failed',
  imageLabel: 'Generated Image', imageOpen: 'View Image', imageOpenNamed: 'View {value}', imageLoading: 'Loading image…', imageLoadFailed: 'Image failed to load. Click to retry.', imagePreview: 'Image Preview', imagePreviewShort: 'Preview', imageClosePreview: 'Close Preview', imageDownload: 'Download', imageDownloadPreparing: 'Preparing original…', imageDownloadFailed: 'Download failed. Retry.', imageZoomOut: 'Zoom Out', imageZoomIn: 'Zoom In', imageFit: 'Fit to Window',
  imageAnnotate: 'Annotate Area', imageAnnotateCancel: 'Cancel Marking', imageAnnotateHint: 'Click on image to add a numbered pin', imageAnnotation: 'Pin {value}', imageAnnotationPlaceholder: 'Describe the modification for this area', imageRegions: 'Region Notes', imageCopyNotes: 'Copy Notes', imageCopied: 'Copied', imagePrevious: 'Previous Image', imageNext: 'Next Image', imageZoomHint: 'Wheel to zoom · drag to pan · double-click for 100%', imageActual: '100%', imageEditPrompt: 'Describe how you want to modify this image', imageEditDefault: 'Edit this image.', imageRegionNotes: 'Region modifications:', imageEdit: 'Continue in Composer', imageEditPreparing: 'Transferring to composer…', imageEditFailed: 'Transfer failed: please ensure markers have notes and composer accepts images.', imageRemoveAnnotation: 'Remove Pin',
};

const zh = en;


const STYLE = `
.codexSubscriptionSearchHead{display:flex;flex-direction:column;gap:1px}.codexSubscriptionSearchScope{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscription{display:flex;flex-direction:column;gap:10px;max-width:720px;color:var(--dsw-alias-label-primary);container-type:inline-size}
.codexSubscription h2,.codexSubscription h3,.codexSubscription p{margin:0}.codexSubscriptionHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.codexSubscription h2{font-size:16px;line-height:24px;font-weight:500}.codexSubscription h3{font-size:14px;line-height:22px;font-weight:500}
.codexSubscriptionTag{border:1px solid var(--dsw-alias-border-l3);border-radius:4px;padding:1px 6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionNote{font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionCard{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.codexSubscriptionUsageCard{padding:12px 14px;gap:9px}.codexSubscriptionPreferencesCard{padding:12px 14px;gap:10px}.codexSubscriptionPreference{min-height:32px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}.codexSubscriptionPreferenceCopy{display:flex;min-width:0;flex-direction:column;gap:2px}.codexSubscriptionPreferenceLabel{display:flex;align-items:center;gap:6px}.codexSubscriptionPreferenceHint{max-width:300px;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionQuotaModes{display:flex;align-items:center;gap:3px;padding:2px;border-radius:9px;background:var(--dsw-alias-bg-module-platform)}.codexSubscriptionQuotaMode{position:relative;display:flex;align-items:center;justify-content:center;min-height:26px;padding:0 9px;border-radius:7px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}.codexSubscriptionQuotaMode small{margin-left:3px;font-size:9px;line-height:1;color:var(--dsw-alias-label-tertiary)}.codexSubscriptionQuotaMode:has(input:checked){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);box-shadow:0 0 0 1px var(--dsw-alias-border-l3)}.codexSubscriptionQuotaMode:has(input:focus-visible){outline:2px solid var(--dsw-alias-border-l3);outline-offset:1px}.codexSubscriptionQuotaMode:has(input:disabled){cursor:not-allowed;opacity:.5}.codexSubscriptionQuotaMode input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.codexSubscriptionContext{display:flex;flex-direction:column;gap:8px}.codexSubscriptionContextHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.codexSubscriptionContextCopy{display:flex;min-width:0;flex:1;flex-direction:column;gap:2px}.codexSubscriptionContextHint{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}.codexSubscriptionContextTrigger{height:32px;min-width:108px;display:inline-flex;align-items:center;justify-content:space-between;gap:10px;padding:0 10px 0 12px;border:0;border-radius:999px;outline:0;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}.codexSubscriptionContextTrigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.codexSubscriptionContextTrigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.codexSubscriptionContextTrigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:not-allowed}.codexSubscriptionContextTrigger svg{color:var(--dsw-alias-label-tertiary);transition:transform 120ms var(--ds-ease-in-out)}.codexSubscriptionContextTrigger[aria-expanded=true] svg{transform:rotate(180deg)}.codexSubscriptionContextModels{display:flex;flex-direction:column;border-top:1px solid var(--dsw-alias-border-l2)}.codexSubscriptionContextModel{min-height:42px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--dsw-alias-border-l2)}.codexSubscriptionContextModel:last-child{border-bottom:0}.codexSubscriptionContextModelCopy{display:flex;min-width:0;flex-direction:column}.codexSubscriptionContextModelCopy strong{font-size:12px;line-height:18px;font-weight:500}.codexSubscriptionContextModelCopy span{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}.codexSubscriptionContextInput{width:116px}
.codexSubscriptionSwitch{position:relative;flex:0 0 auto;width:32px;height:18px;padding:0;border:1px solid var(--dsw-alias-border-l3);border-radius:999px;background:var(--dsw-alias-bg-module-platform);cursor:pointer}.codexSubscriptionSwitch:disabled{cursor:not-allowed;opacity:.5}.codexSubscriptionSwitch[aria-checked=true]{background:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-label-secondary)}.codexSubscriptionSwitchKnob{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:var(--dsw-alias-bg-layer-1);transition:transform 120ms var(--ds-ease-in-out)}.codexSubscriptionSwitch[aria-checked=true] .codexSubscriptionSwitchKnob{transform:translateX(14px)}
.codexSubscriptionSearch{display:flex;flex-direction:column;gap:7px}.codexSubscriptionSearchChoices{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px}.codexSubscriptionSearchChoice{display:grid;grid-template-columns:14px minmax(0,1fr);align-items:center;column-gap:8px;min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);padding:9px 10px;text-align:left;cursor:pointer}.codexSubscriptionSearchChoice:has(input:disabled){cursor:not-allowed;opacity:.5}.codexSubscriptionSearchChoice:has(input:checked){border-color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}.codexSubscriptionSearchChoice:has(input:focus-visible){outline:2px solid var(--dsw-alias-border-l3);outline-offset:2px}.codexSubscriptionSearchInput{width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-label-primary);cursor:inherit}.codexSubscriptionSearchCopy{display:block;min-width:0;pointer-events:none}.codexSubscriptionSearchCopy strong,.codexSubscriptionSearchCopy span{display:block}.codexSubscriptionSearchCopy strong{font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary)}.codexSubscriptionSearchChoice:has(input:checked) strong{color:var(--dsw-alias-label-primary)}.codexSubscriptionSearchCopy span{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}.codexSubscriptionDivider{height:1px;background:var(--dsw-alias-border-l2)}
.codexSubscriptionQuotaModes[data-saving=true] .codexSubscriptionQuotaMode:has(input:disabled){cursor:wait;opacity:1}.codexSubscriptionSearchChoices[data-saving=true] .codexSubscriptionSearchChoice:has(input:disabled){cursor:wait;opacity:1}
.codexSubscriptionAccountRow,.codexSubscriptionSectionHead{display:flex;align-items:center;justify-content:space-between;gap:12px}.codexSubscriptionStatus{display:flex;align-items:center;gap:8px;font-size:14px;line-height:22px;font-weight:500}
.codexSubscriptionAccounts{display:flex;flex-direction:column;border-top:1px solid var(--dsw-alias-border-l2)}.codexSubscriptionAccount{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:42px;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:13px}.codexSubscriptionAccount:last-child{border-bottom:0}.codexSubscriptionAccount[data-active=true] .codexSubscriptionEmail,.codexSubscriptionAccount[data-active=true]>span{font-weight:600}.codexSubscriptionEmail{max-width:100%;overflow:hidden;padding:2px 4px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.codexSubscriptionEmail:hover{background:var(--dsw-alias-interactive-bg-hover)}.codexSubscriptionEmail:focus-visible{outline:2px solid var(--dsw-alias-border-l3);outline-offset:1px}.codexSubscriptionFlow label{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-dimmed)}.codexSubscriptionDot[data-state=connected]{background:var(--dsw-alias-state-success-primary)}.codexSubscriptionDot[data-state=disconnected]{background:var(--dsw-alias-state-error-primary)}
.codexSubscriptionActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.codexSubscriptionFlow{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:10px;background:var(--dsw-alias-bg-module-platform)}
.codexSubscriptionFlow p{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}.codexSubscriptionCode{width:max-content;max-width:100%;font:600 16px/22px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em;overflow-wrap:anywhere}
.codexSubscriptionError{font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary)}.codexSubscriptionInput{width:100%;box-sizing:border-box}
.codexSubscriptionRecover{display:flex;align-items:center;justify-content:space-between;gap:12px}.codexSubscriptionRecover .codexSubscriptionError{flex:1}.codexSubscriptionRecover button{flex:0 0 auto}
.codexSubscriptionDiagnostics{padding:8px 12px;gap:8px;background:transparent;color:var(--dsw-alias-label-secondary)}.codexSubscriptionDiagnostics pre{max-height:240px;margin:0;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/17px ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--dsw-alias-label-secondary)}.codexSubscriptionLink{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 13px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;text-decoration:none;white-space:nowrap}.codexSubscriptionLink:hover{background:var(--dsw-alias-bg-module-platform)}.codexSubscriptionLink:focus-visible{outline:2px solid var(--dsw-alias-border-l3);outline-offset:2px}
.codexSubscriptionSectionTitle{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}.codexSubscriptionFreshness{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionRefresh{flex:0 0 auto;min-width:72px;width:max-content;white-space:nowrap!important;word-break:keep-all!important;overflow-wrap:normal!important;writing-mode:horizontal-tb!important}.codexSubscriptionRefresh *{white-space:nowrap!important;word-break:keep-all!important;writing-mode:horizontal-tb!important}
.codexSubscriptionEmpty{padding:18px;border:1px dashed var(--dsw-alias-border-l3);border-radius:10px;text-align:center;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionLimits{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:6px}.codexSubscriptionLimit{min-width:0;border-radius:10px;padding:9px 12px;background:var(--dsw-alias-bg-module-platform);display:flex;flex-direction:column;gap:6px}
.codexSubscriptionLimitTop{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.codexSubscriptionLimitLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.codexSubscriptionLimit strong{font:600 18px/24px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}
.codexSubscriptionLimit progress{width:100%;height:4px;border:0;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l3);accent-color:var(--dsw-alias-brand-primary,#3964fe);-webkit-appearance:none;appearance:none}
.codexSubscriptionLimit progress::-webkit-progress-bar{background:var(--dsw-alias-border-l3);border-radius:999px}.codexSubscriptionLimit progress::-webkit-progress-value{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}.codexSubscriptionLimit progress::-moz-progress-bar{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}.codexSubscriptionLimitMeta{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionCreditSection{display:flex;flex-direction:column;gap:7px}.codexSubscriptionCreditNote{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}.codexSubscriptionCreditRows{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}.codexSubscriptionCreditBalance,.codexSubscriptionSpendLimit{min-width:0;border-radius:10px;padding:12px 14px;background:var(--dsw-alias-bg-module-platform)}
.codexSubscriptionCreditBalance{display:flex;flex-direction:column;gap:6px}.codexSubscriptionCreditBalance span,.codexSubscriptionCreditLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.codexSubscriptionCreditBalance strong{font:600 18px/24px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.codexSubscriptionCreditRows{display:flex;flex-direction:column;gap:6px}.codexSubscriptionResetMeta{display:flex;min-width:0;flex-direction:column;gap:1px}.codexSubscriptionResetBalance{display:flex;flex-direction:column;gap:8px}.codexSubscriptionResetCard{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;padding:9px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-module-platform)}.codexSubscriptionResetCard .codexSubscriptionResetMeta{flex:1}.codexSubscriptionResetCard strong{overflow:hidden;font-size:12px;line-height:18px;font-weight:500;text-overflow:ellipsis;white-space:nowrap}.codexSubscriptionResetCard .codexSubscriptionActions{flex:0 0 auto}.codexSubscriptionResetCard .codexSubscriptionResetUse{min-height:28px;padding:0 10px}.codexSubscriptionResetBalance .codexSubscriptionActions{justify-content:flex-start}.codexSubscriptionResetFlow{display:flex;flex-direction:column;gap:10px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:10px}.codexSubscriptionResetFlow h4{margin:0;font-size:13px;line-height:20px;font-weight:500}.codexSubscriptionResetWarning{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.codexSubscriptionResetExpiry{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}.codexSubscriptionResetCheck{display:flex;align-items:flex-start;gap:8px;padding:9px 10px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);cursor:pointer}.codexSubscriptionResetCheck input{margin:3px 0 0;accent-color:var(--dsw-alias-label-primary)}.codexSubscriptionResetFinal{border-color:var(--dsw-alias-state-error-primary)!important;color:var(--dsw-alias-state-error-primary)!important}.codexSubscriptionResetResult{font-size:12px;line-height:18px;color:var(--dsw-alias-state-success-primary)}
.codexSubscriptionResetUse:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.codexSubscriptionResetUse:focus-visible{outline:2px solid var(--dsw-alias-border-l3);outline-offset:1px}
.codexSubscriptionSpendLimit{display:flex;flex-direction:column;gap:8px}.codexSubscriptionSpendTop{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.codexSubscriptionSpendTop strong{font:600 16px/22px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}.codexSubscriptionSpendLimit progress{width:100%;height:6px;border:0;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l3);accent-color:var(--dsw-alias-brand-primary,#3964fe);-webkit-appearance:none;appearance:none}.codexSubscriptionSpendLimit progress::-webkit-progress-bar{background:var(--dsw-alias-border-l3);border-radius:999px}.codexSubscriptionSpendLimit progress::-webkit-progress-value{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}.codexSubscriptionSpendLimit progress::-moz-progress-bar{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}
.codexComposerQuotaWindows{display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap}.codexComposerQuota{display:inline-flex;align-items:center;gap:5px;flex:0 0 auto;height:28px;box-sizing:border-box;padding:0;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:20px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap;user-select:none}.codexComposerQuotaBar{display:block;width:40px;height:4px;border:0;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l3);accent-color:var(--dsw-alias-label-secondary);-webkit-appearance:none;appearance:none}.codexComposerQuotaBar::-webkit-progress-bar{background:var(--dsw-alias-border-l3);border-radius:999px}.codexComposerQuotaBar::-webkit-progress-value{background:var(--dsw-alias-label-secondary);border-radius:999px}.codexComposerQuotaBar::-moz-progress-bar{background:var(--dsw-alias-label-secondary);border-radius:999px}
.codexModelSelect{position:relative;min-width:0}.codexModelSelectTrigger{display:flex;align-items:center;gap:4px;min-width:0;max-width:min(360px,45cqw);height:28px;padding:0 4px 0 8px;border:0;border-radius:24px;outline:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;line-height:20px;cursor:pointer}.codexModelSelectTrigger:hover:not(:disabled),.codexModelSelectTrigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}.codexModelSelectTrigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.codexModelSelectTrigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.codexModelSelectBolt{display:block;flex:none;width:14px;height:14px;color:var(--dsw-alias-label-primary)}.codexModelSelectLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.codexModelSelectEffort{flex:none;color:var(--dsw-alias-label-caption)}.codexModelSelectChevron{flex:none;color:var(--dsw-alias-label-caption);transition:transform 120ms}.codexModelSelectTrigger[aria-expanded=true] .codexModelSelectChevron{transform:rotate(180deg)}
.codexModelSelectMenu,.codexModelSelectSubmenu{position:absolute;z-index:30;box-sizing:border-box;width:max-content;min-width:min(240px,calc(100vw - 32px));max-width:min(420px,calc(100vw - 32px));max-height:min(360px,calc(100vh - 96px));padding:4px;border:1px solid var(--dsw-alias-border-inverted);border-radius:12px;background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);overflow:hidden}.codexModelSelectMenu{right:0;bottom:calc(100% + 8px)}.codexModelSelectSubmenu{right:calc(100% + 8px);bottom:0;min-width:min(230px,calc(100vw - 32px))}.codexModelSelectCell{display:flex;align-items:center;gap:8px;width:100%;min-width:100%;height:40px;box-sizing:border-box;padding:0 10px;border:0;border-radius:10px;background:transparent;color:inherit;font-size:14px;line-height:22px;text-align:left;cursor:pointer}.codexModelSelectCell:hover,.codexModelSelectCell:focus-visible,.codexModelSelectCell[data-open=true]{background:var(--dsw-alias-interactive-bg-hover);outline:0}.codexModelSelectCell:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.codexModelSelectCellLabel{flex:none;white-space:nowrap}.codexModelSelectCellValue{flex:auto;min-width:0;overflow:hidden;color:var(--dsw-alias-label-tertiary);text-align:right;text-overflow:ellipsis;white-space:nowrap}.codexModelSelectCellChevron{flex:none;color:var(--dsw-alias-label-tertiary)}.codexModelSelectGroups{min-height:0;max-height:352px;overflow-y:auto}.codexModelSelectGroup+.codexModelSelectGroup{margin-top:4px}.codexModelSelectGroupTitle{position:sticky;top:0;z-index:1;padding:5px 8px 3px;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:500;line-height:18px}.codexModelSelectOption{display:flex;align-items:center;gap:8px;width:100%;min-width:100%;min-height:38px;box-sizing:border-box;padding:6px 8px;border:0;border-radius:10px;outline:0;background:transparent;color:inherit;text-align:left;cursor:pointer}.codexModelSelectOption:hover:not(:disabled),.codexModelSelectOption:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}.codexModelSelectOption:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.codexModelSelectOptionCopy{display:flex;flex:1;min-width:0;flex-direction:column}.codexModelSelectOptionName{overflow:hidden;color:inherit;font-size:14px;font-weight:500;line-height:20px;text-overflow:ellipsis;white-space:nowrap}.codexModelSelectOptionDescription{overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}.codexModelSelectCheck{display:grid;place-items:center;flex:0 0 18px;color:var(--dsw-alias-label-primary)}.codexModelSelectStatus,.codexModelSelectEmpty{padding:10px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.codexModelSelectError,.codexModelSelectWarning{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px;padding:7px 8px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}.codexModelSelectWarning{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label)}.codexModelSelectRetry{flex:none;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}
.codexModelSelectMenu{overflow:visible}
.codexImageTool{display:flex;flex-direction:column;gap:8px;margin:4px 0;color:var(--dsw-alias-label-primary)}.codexImageToolRow{display:flex;align-items:center;min-height:24px;gap:8px;font-size:13px;line-height:20px}.codexImageToolIcon{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;color:var(--dsw-alias-label-secondary)}.codexImageToolIcon::before{content:'';width:8px;height:8px;border:1.5px solid currentColor;border-radius:3px}.codexImageTool[data-state=running] .codexImageToolIcon::before{border-radius:50%;border-right-color:transparent;animation:codexImageSpin 800ms linear infinite}.codexImageTool[data-state=error] .codexImageToolIcon::before{border-color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-state-error-primary)}.codexImageToolTitle{font-weight:500}.codexImageToolState{color:var(--dsw-alias-label-tertiary)}.codexImageToolError{margin:0 0 0 24px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}.codexImageToolGallery{margin-left:24px}.codexGeneratedImageFrame{display:flex;align-items:center;justify-content:center;width:min(240px,100%);height:240px;padding:0;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);cursor:pointer}.codexGeneratedImageFrame img{display:block;width:100%;height:100%;object-fit:cover}.codexGeneratedImageRetry{min-height:36px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);cursor:pointer}.codexGeneratedImageModal{width:min(920px,calc(100vw - 32px));max-height:calc(100vh - 32px)}.codexGeneratedImageModalContent{min-height:0;overflow:hidden}.codexGeneratedImageViewer{display:flex;min-width:0;flex-direction:column;gap:12px}.codexGeneratedImageStage{display:grid;place-items:center;min-height:280px;max-height:calc(100vh - 260px);overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-module-platform)}.codexGeneratedImageStage img{display:block;max-width:100%;max-height:calc(100vh - 280px);object-fit:contain;transform-origin:center;transition:transform 120ms ease}.codexGeneratedImageMeta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.codexGeneratedImageToolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.codexGeneratedImageZoom{display:flex;align-items:center;gap:6px}.codexGeneratedImageZoomValue{min-width:44px;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:center}.codexGeneratedImageDownload{display:inline-flex;align-items:center;gap:6px;min-height:32px;box-sizing:border-box;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;text-decoration:none}.codexGeneratedImageDownload:hover{background:var(--dsw-alias-interactive-bg-hover)}.codexGeneratedImageGuidance{display:flex;flex-direction:column;gap:2px;padding-top:2px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}@keyframes codexImageSpin{to{transform:rotate(360deg)}}
.codexImageBeta{padding:0 5px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:16px}
.codexImageToolGallery{display:flex;align-items:flex-start;flex-direction:column;gap:8px}
@container (max-width:560px){.codexSubscriptionCreditRows{grid-template-columns:1fr}}
@container (max-width:480px){.codexSubscriptionAccountRow,.codexSubscriptionSectionHead{align-items:flex-start;flex-direction:column}.codexSubscriptionActions{width:100%}.codexSubscriptionSearchChoices{grid-template-columns:1fr}}
@media(max-width:640px){.codexSubscriptionCard{padding:14px}}
`

const unwrap = response => {
  if (!response?.ok) throw new Error(response?.error?.message ?? 'Codex RPC failed')
  return response.value
}
const accountStatusErrorText = (error, t) => {
  const key = {
    'credential-unavailable': 'accountCredentialUnavailable',
    'credential-malformed': 'accountCredentialMalformed',
    timeout: 'accountStatusTimeout',
    transport: 'accountStatusTransport',
    unknown: 'accountStatusUnknown',
  }[error?.code]
  return t(key ?? 'accountStatusUnknown')
}
const fill = (text, values) => Object.entries(values).reduce((next, [key, value]) => next.replace(`{${key}}`, String(value)), text)
const maskEmail = value => {
  if (typeof value !== 'string' || !value.includes('@')) return '••••'
  const [local, domain] = value.split('@', 2)
  if (local.length <= 2) return `${local.slice(0, 1)}••@${domain}`
  return `${local[0]}•••${local.at(-1)}@${domain}`
}
const hours = seconds => Math.round((seconds / 3600) * 10) / 10
const percent = value => Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })
const isApproximateWindow = (seconds, expected) => seconds >= expected * 0.95 && seconds <= expected * 1.05
const windowLabel = (seconds, t) => {
  if (isApproximateWindow(seconds, 18_000)) return t('windowFiveHours')
  if (isApproximateWindow(seconds, 86_400)) return t('windowDaily')
  if (isApproximateWindow(seconds, 604_800)) return t('windowWeekly')
  if (isApproximateWindow(seconds, 2_592_000)) return t('windowMonthly')
  if (isApproximateWindow(seconds, 31_536_000)) return t('windowAnnual')
  return seconds >= 86_400 && seconds % 86_400 === 0
    ? fill(t('windowDays'), { value: seconds / 86_400 })
    : fill(t('windowHours'), { value: hours(seconds) })
}
const validDate = value => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}
const imageDownloadName = attachment => {
  const fallback = 'codex-generated-image.png'
  if (typeof attachment?.name !== 'string') return fallback
  const cleaned = attachment.name.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '-').replace(/[. ]+$/u, '').trim()
  if (cleaned === '') return fallback
  return cleaned.toLowerCase().endsWith('.png') ? cleaned : `${cleaned}.png`
}

const originalRefMatches = (left, right) => left.assetId === right.assetId
  && left.mediaType === right.mediaType && left.bytes === right.bytes
  && left.width === right.width && left.height === right.height
  && left.name === right.name && left.sha256 === right.sha256

async function sha256Hex(data) {
  const value = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function decodeBase64Chunk(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(ORIGINAL_IMAGE_CHUNK_BYTES / 3) * 4 + 8) throw new Error('Invalid original image chunk')
  let decoded
  try { decoded = atob(value) } catch { throw new Error('Invalid original image chunk') }
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index)
  return bytes
}

async function readOriginalImage(rpc, sessionId, original) {
  const parts = []
  let total = 0
  let done = false
  while (!done) {
    const chunk = unwrap(await rpc.call(CHANNEL, 'image/original/chunk', { sessionId, assetId: original.assetId, offset: total }))
    const ref = decodeOriginalImageRef(chunk?.ref)
    if (ref === undefined || !originalRefMatches(ref, original) || chunk.offset !== total || typeof chunk.done !== 'boolean') throw new Error('Original image metadata changed')
    const bytes = decodeBase64Chunk(chunk.encoded)
    if (bytes.byteLength === 0 || total + bytes.byteLength > original.bytes) throw new Error('Original image download is incomplete')
    parts.push(bytes)
    total += bytes.byteLength
    done = chunk.done
  }
  if (total !== original.bytes) throw new Error('Original image download is incomplete')
  const data = new Uint8Array(total)
  let offset = 0
  for (const part of parts) { data.set(part, offset); offset += part.byteLength }
  if (await sha256Hex(data) !== original.sha256) throw new Error('Original image integrity check failed')
  return data
}

function triggerBlobDownload(data, mediaType, filename) {
  const url = URL.createObjectURL(new Blob([data], { type: mediaType }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  try { anchor.click() } finally { anchor.remove(); URL.revokeObjectURL(url) }
}

function CodexGeneratedImage({ attachment, original, rpc, sessionId, loadImage, attachForEdit, getImageViewer, getInternalImageViewer, t }) {
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState(false)
  const [src, setSrc] = useState()
  const triggerRef = useRef(null)
  useEffect(() => {
    let live = true
    setError(false)
    setSrc(undefined)
    void Promise.resolve().then(() => loadImage(attachment))
      .then(value => { if (live) setSrc(value) })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [attachment, loadImage, attempt])
  const label = attachment.name ?? t('imageLabel')
  const downloadName = imageDownloadName(attachment)
  const downloadOriginal = async () => {
    if (original === undefined) return
    triggerBlobDownload(await readOriginalImage(rpc, sessionId, original), original.mediaType, original.name)
  }
  const openImage = () => {
    if (src === undefined) return
    const request = {
      items: [{
        id: attachment.attachmentId ?? downloadName,
        src,
        name: label,
        width: attachment.width,
        height: attachment.height,
        bytes: attachment.bytes,
        download: original === undefined ? undefined : {
          pendingLabel: t('imageDownloadPreparing'),
          errorLabel: t('imageDownloadFailed'),
          onInvoke: downloadOriginal,
        },
        actions: [{
          id: 'continue-editing',
          label: t('imageEdit'),
          pendingLabel: t('imageEditPreparing'),
          errorLabel: t('imageEditFailed'),
          closeOnSuccess: true,
          onInvoke: ({ annotations = [] }) => {
            const imageKey = String(attachment.attachmentId ?? 'image').replace(/[^a-zA-Z0-9_-]/g, '_')
            const sourceName = annotations.length === 0 ? downloadName : `codex-edit-${imageKey}-source.png`
            const referenceName = `codex-edit-${imageKey}-annotations.png`
            return attachForEdit(src, sourceName, buildImageEditDraft({
              annotations, translate: t, width: attachment.width, height: attachment.height,
              sourceName, referenceName,
            }), annotations, referenceName)
          },
        }],
      }],
      opener: triggerRef.current,
      source: 'codex-generated',
      annotations: true,
    }
    if (getInternalImageViewer?.()?.open?.(request) === true) return
    const viewer = getImageViewer?.()
    viewer?.open?.(request)
  }
  if (error) {
    return <button type="button" className="codexGeneratedImageRetry" onClick={() => setAttempt(value => value + 1)}>{t('imageLoadFailed')}</button>
  }
  return <button ref={triggerRef} type="button" className="codexGeneratedImageFrame" title={t('imageOpen')} aria-label={fill(t('imageOpenNamed'), { value: label })} onClick={openImage}>
    {src === undefined ? <span>{t('imageLoading')}</span> : <img src={src} alt={label} />}
  </button>
}

function CodexImageToolRow({ block, sessionId, rpc, loadImage, attachForEdit, getImageViewer, getInternalImageViewer, t }) {
  const settled = block?.kind === 'tool-result'
  const image = settled
    ? block.content.find(item => item?.type === 'image' && item.attachment !== undefined)
    : undefined
  const failed = settled && block.isError === true
  const state = !settled ? 'running' : failed ? 'error' : 'done'
  const status = !settled ? t('imageGenerating') : failed ? t('imageFailed') : t('imageGenerated')
  const error = failed
    ? block.content.find(item => item?.type === 'text' && typeof item.text === 'string')?.text
    : undefined
  const original = decodeImagePresentation(block?.meta)?.original
  return <div className="codexImageTool" data-state={state}>
    <div className="codexImageToolRow"><span className="codexImageToolIcon" aria-hidden="true" /><span className="codexImageToolTitle">{t('imageGenerate')}</span><span className="codexImageBeta">{t('imageBeta')}</span><span className="codexImageToolState">{status}</span></div>
    {image === undefined ? null : <div className="codexImageToolGallery"><CodexGeneratedImage attachment={image.attachment} original={original} rpc={rpc} sessionId={sessionId} loadImage={loadImage} attachForEdit={attachForEdit} getImageViewer={getImageViewer} getInternalImageViewer={getInternalImageViewer} t={t} /></div>}
    {error === undefined ? null : <p className="codexImageToolError">{error}</p>}
  </div>
}

const usePreferenceSnapshot = preference => useSyncExternalStore(
  preference.subscribe,
  preference.getSnapshot,
)
const useAccountStatusSnapshot = accountStatus => useSyncExternalStore(
  accountStatus.subscribe,
  accountStatus.getSnapshot,
)

const notifyQuickQuota = () => window.dispatchEvent(new Event(QUICK_QUOTA_REFRESH_EVENT))

const formatRunway = (seconds, t) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined
  const minutes = Math.max(1, Math.round(seconds / 60))
  const days = Math.floor(minutes / 1_440)
  const hours = Math.floor((minutes % 1_440) / 60)
  if (days > 0) return hours > 0 ? fill(t('runwayDaysHours'), { days, hours }) : fill(t('runwayDays'), { days })
  if (hours > 0) return fill(t('runwayHours'), { hours })
  return fill(t('runwayMinutes'), { minutes })
}

const formatQuotaForecast = (forecast, t) => {
  if (forecast?.status === 'calibrating') return t('quotaForecastCalibrating')
  if (forecast?.status === 'idle') return t('quotaForecastIdle')
  if (forecast?.status !== 'ready') return undefined
  if (forecast.survivesReset) return t('quotaForecastUntilReset')
  const duration = formatRunway(forecast.runwaySeconds, t)
  return duration === undefined ? undefined : fill(t('quotaForecast'), { symbol: '≈', duration })
}

function useQuickQuota(rpc, enabled, model) {
  const [quota, setQuota] = useState()
  useEffect(() => {
    if (!enabled) {
      setQuota(undefined)
      return undefined
    }
    let live = true
    let loading = false
    const load = async () => {
      if (loading) return
      loading = true
      try {
        const account = unwrap(await rpc.call(CHANNEL, 'status', {}))
        if (!live) return
        if (account?.authenticated !== true) {
          setQuota(undefined)
          return
        }
        const usage = unwrap(await rpc.call(CHANNEL, 'usage', { force: false }))
        if (live) setQuota(selectModelQuotaWindows(usage, model))
      } catch {
        if (live) setQuota(undefined)
      } finally {
        loading = false
      }
    }
    const refresh = () => { void load() }
    void load()
    const timer = window.setInterval(refresh, QUICK_QUOTA_REFRESH_MS)
    window.addEventListener(QUICK_QUOTA_REFRESH_EVENT, refresh)
    return () => {
      live = false
      window.clearInterval(timer)
      window.removeEventListener(QUICK_QUOTA_REFRESH_EVENT, refresh)
    }
  }, [rpc, enabled, model])
  return quota
}

function QuickQuotaPreference({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  const writable = snapshot.status === 'ready' && snapshot.writable === true
  const choice = (value, label) => <label className="codexSubscriptionQuotaMode"><input type="radio" name="codex-subscription-quota-mode" checked={snapshot.quickQuotaMode === value} disabled={!writable} onChange={() => { void preference.set({ [QUICK_QUOTA_MODE_FIELD]: value }) }} /><span>{label}</span></label>
  return <div className="codexSubscriptionPreference">
    <div className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionPreferenceLabel">{t('quickQuotaSetting')}</span>{snapshot.quickQuotaMode === QUICK_QUOTA_MODE_FORECAST ? <span className="codexSubscriptionPreferenceHint">{t('quickQuotaForecastHint')}</span> : null}</div>
    <div className="codexSubscriptionQuotaModes" data-saving={snapshot.saving || undefined} aria-busy={snapshot.saving || undefined} role="radiogroup" aria-label={t('quickQuotaSetting')}>
      {choice(QUICK_QUOTA_MODE_OFF, t('quickQuotaOff'))}
      {choice(QUICK_QUOTA_MODE_PERCENT, t('quickQuotaPercent'))}
      {choice(QUICK_QUOTA_MODE_BAR, t('quickQuotaBar'))}
      {choice(QUICK_QUOTA_MODE_FORECAST, <>{t('quickQuotaForecast')} <small>{t('quickQuotaBeta')}</small></>)}
    </div>
  </div>
}

function SearchProviderPreference({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  const writable = snapshot.status === 'ready' && snapshot.writable === true
  const choice = (value, label, hint) => <label className="codexSubscriptionSearchChoice"><input className="codexSubscriptionSearchInput" type="radio" name="codex-subscription-search-provider" checked={snapshot.searchProvider === value} disabled={!writable} onChange={() => { void preference.set({ [SEARCH_PROVIDER_FIELD]: value }) }} /><span className="codexSubscriptionSearchCopy"><strong>{label}</strong><span>{hint}</span></span></label>
  return <div className="codexSubscriptionSearch">
    <div className="codexSubscriptionSearchHead"><h3>{t('searchTitle')}</h3><span className="codexSubscriptionSearchScope">{t('searchScope')}</span></div>
    <div className="codexSubscriptionSearchChoices" data-saving={snapshot.saving || undefined} aria-busy={snapshot.saving || undefined} role="radiogroup" aria-label={t('searchTitle')}>
      {choice(SEARCH_PROVIDER_AUTO, t('searchAuto'), t('searchAutoHint'))}
      {choice(SEARCH_PROVIDER_DSH, t('searchDsh'), t('searchDshHint'))}
      {choice(SEARCH_PROVIDER_CODEX, t('searchCodex'), t('searchCodexHint'))}
    </div>
  </div>
}

function ContextWindowPreference({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  const writable = snapshot.status === 'ready' && snapshot.writable === true
  const [menuOpen, setMenuOpen] = useState(false)
  const modelRows = snapshot.contextModels.filter(model => model.fixed !== true)
  const fixedRows = snapshot.contextModels.filter(model => model.fixed === true)
  const [drafts, setDrafts] = useState({})
  const previousSavedValues = useRef()
  const draftSeed = modelRows.map(model => `${model.key}\u0000${snapshot.customContextWindows[model.key]}`).join('\u0001')
  useEffect(() => {
    const savedValues = Object.fromEntries(modelRows.map(model => [model.key, String(snapshot.customContextWindows[model.key])]))
    const previous = previousSavedValues.current
    setDrafts(current => reconcileContextDrafts({
      modelRows,
      drafts: current,
      previousSavedValues: previous,
      savedValues,
    }))
    previousSavedValues.current = savedValues
  }, [draftSeed])
  const hint = snapshot.contextMode === CONTEXT_MODE_EXTENDED
    ? t('contextExtendedHint')
    : snapshot.contextMode === CONTEXT_MODE_CUSTOM
      ? t('contextCustomHint')
      : t('contextStandardHint')
  const commit = modelKey => {
    const parsed = parseContextWindow(drafts[modelKey])
    if (!Number.isInteger(parsed)) {
      setDrafts(current => ({ ...current, [modelKey]: String(snapshot.customContextWindows[modelKey]) }))
      return
    }
    const value = normalizeCustomContextWindow(parsed, CUSTOM_CONTEXT_MODEL_CAPS[modelKey])
    setDrafts(current => ({ ...current, [modelKey]: String(value) }))
    if (value !== snapshot.customContextWindows[modelKey]) void preference.set({ [CUSTOM_CONTEXT_MODEL_FIELDS[modelKey]]: value })
  }
  const contextModeItems = [
    { id: CONTEXT_MODE_STANDARD, label: t('contextStandard') },
    { id: CONTEXT_MODE_EXTENDED, label: t('contextExtended') },
    { id: CONTEXT_MODE_CUSTOM, label: t('contextCustom') },
  ]
  const selectedMode = contextModeItems.find(item => item.id === snapshot.contextMode)?.label ?? t('contextStandard')
  return <div className="codexSubscriptionContext">
    <div className="codexSubscriptionContextHead">
      <div className="codexSubscriptionContextCopy"><span className="codexSubscriptionPreferenceLabel">{t('contextTitle')}</span><span className="codexSubscriptionContextHint">{hint}</span></div>
      <Menu open={menuOpen} items={contextModeItems} selectedId={snapshot.contextMode} onSelect={value => { setMenuOpen(false); void preference.set({ [CONTEXT_MODE_FIELD]: value }) }} onClose={() => setMenuOpen(false)} align="end" side="bottom" portal compact anchor={<button className="codexSubscriptionContextTrigger" type="button" aria-label={t('contextTitle')} aria-haspopup="menu" aria-expanded={menuOpen} disabled={!writable} onClick={() => setMenuOpen(value => !value)}><span>{selectedMode}</span><IconChevronDownOutline14 /></button>} />
    </div>
    {snapshot.contextMode === CONTEXT_MODE_CUSTOM ? <div className="codexSubscriptionContextModels">{modelRows.map(model => <div className="codexSubscriptionContextModel" key={model.key}><span className="codexSubscriptionContextModelCopy"><strong>{model.label}</strong><span>{fill(t('contextMaximum'), { value: String(model.maximum) })}</span></span><Input aria-label={`${model.label} ${t('contextTokens')}`} className="codexSubscriptionContextInput" type="number" inputMode="numeric" min={MIN_CUSTOM_CONTEXT_WINDOW} max={model.maximum} step={1} value={drafts[model.key] ?? ''} disabled={!writable} onChange={event => { const nextValue = event.currentTarget.value; setDrafts(current => ({ ...current, [model.key]: nextValue })) }} onBlur={() => commit(model.key)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></div>)}{fixedRows.map(model => <div className="codexSubscriptionContextModel" key={model.key}><span className="codexSubscriptionContextModelCopy"><strong>{model.label}</strong><span>{fill(t('contextFixed'), { value: formatContextWindow(model.maximum) })}</span></span><span className="codexSubscriptionContextHint">{formatContextWindow(model.maximum)}</span></div>)}</div> : null}
    {snapshot.modelError ? <div className="codexSubscriptionRecover" role="alert"><p className="codexSubscriptionError">{t('modelDirectoryFailed')}</p><Button type="button" variant="outline" onClick={() => { void preference.refreshModels() }}>{t('modelRetry')}</Button></div> : null}
  </div>
}

function PreferencesCard({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  return <div className="codexSubscriptionCard codexSubscriptionPreferencesCard">
    <SearchProviderPreference preference={preference} t={t} />
    <div className="codexSubscriptionDivider" />
    <ContextWindowPreference preference={preference} t={t} />
    <div className="codexSubscriptionDivider" />
    <QuickQuotaPreference preference={preference} t={t} />
    {snapshot.error ? <div className="codexSubscriptionRecover" role="alert"><p className="codexSubscriptionError">{t('preferenceFailed')}</p><Button type="button" variant="outline" onClick={() => { void preference.retry() }}>{t('preferenceRetry')}</Button></div> : null}
  </div>
}

function CodexComposerQuota({ preference, rpc, t, directory }) {
  const preferenceSnapshot = usePreferenceSnapshot(preference)
  const modelState = useSyncExternalStore(
    listener => directory.subscribe(listener),
    () => directory.getSnapshot(),
  )
  const current = modelState.current
  const codex = current?.provider === 'openai-codex' || current?.provider === 'codex-oauth'
  const quotaEnabled = preferenceSnapshot.status === 'ready' && preferenceSnapshot.quickQuotaMode !== QUICK_QUOTA_MODE_OFF && codex
  const forecastMode = preferenceSnapshot.quickQuotaMode === QUICK_QUOTA_MODE_FORECAST
  const quotas = useQuickQuota(rpc, quotaEnabled, current?.model)
  if (!quotaEnabled || quotas === undefined || quotas.length === 0) return null
  return <span className="codexComposerQuotaWindows">{quotas.map((quota, index) => <CodexComposerQuotaWindow key={`${quota.windowSeconds}-${index}`} quota={quota} mode={preferenceSnapshot.quickQuotaMode} forecastMode={forecastMode} t={t} />)}</span>
}

function CodexComposerQuotaWindow({ quota, mode, forecastMode, t }) {
  const value = Math.round(Number(quota.remainingPercent) * 10) / 10
  const display = percent(value)
  const forecast = forecastMode ? quota.forecast : undefined
  const duration = forecast?.status === 'ready' && !forecast.survivesReset ? formatRunway(forecast.runwaySeconds, t) : undefined
  const label = forecast?.status === 'calibrating'
    ? fill(t('quickQuotaForecastCalibratingStatus'), { value: display })
    : forecast?.status === 'idle'
      ? fill(t('quickQuotaForecastIdleStatus'), { value: display })
      : forecast?.status === 'ready' && forecast.survivesReset
        ? fill(t('quickQuotaForecastUntilResetStatus'), { value: display })
        : duration === undefined
          ? fill(t('quickQuotaStatus'), { value: display })
          : fill(t('quickQuotaForecastStatus'), { value: display, duration })
  const content = mode === QUICK_QUOTA_MODE_BAR
    ? <progress className="codexComposerQuotaBar" max={100} value={value} aria-hidden="true" />
    : forecast?.status === 'calibrating'
      ? `${display}% · ${t('quickQuotaForecastCalibrating')}`
      : forecast?.status === 'idle'
        ? `${display}% · ${t('quickQuotaForecastIdle')}`
        : forecast?.status === 'ready' && forecast.survivesReset
          ? `${display}% · ${t('quickQuotaForecastUntilReset')}`
          : forecastMode && duration !== undefined
            ? `${display}% · ≈${duration}`
            : `${display}%`
  const durationLabel = windowLabel(quota.windowSeconds, t)
  const accessibleLabel = `${durationLabel}: ${label}`
  return <span className="codexComposerQuota" role="status" aria-label={accessibleLabel} title={accessibleLabel}><span>{durationLabel}</span>{content}</span>
}

function CodexModelSelect({ locked, available, directory, load, select, preference, t }) {
  const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  const preferenceSnapshot = usePreferenceSnapshot(preference)
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState('root')
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const id = useId()
  const choices = useMemo(() => state.groups.flatMap(group => group.models.map(model => ({
    group,
    model,
    selection: {
      provider: group.id,
      model: model.id,
      ...(model.reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: model.reasoning.defaultEffort }),
    },
  }))), [state.groups])
  const currentChoice = choices.find(choice => choice.selection.provider === state.current?.provider && choice.selection.model === state.current?.model)
  const reasoning = currentChoice?.model.reasoning
  const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortLabel = reasoning === undefined
    ? undefined
    : effectiveEffort === undefined
      ? t('providerDefault')
      : reasoning.efforts.find(level => level.id === effectiveEffort)?.name ?? effectiveEffort
  const effortChoices = useMemo(() => reasoning === undefined ? [] : [
    ...(reasoning.defaultEffort === undefined ? [{ key: 'provider-default', effort: undefined, label: t('providerDefault') }] : []),
    ...reasoning.efforts.map(effort => ({
      key: `effort:${effort.id}`,
      effort: effort.id,
      label: effort.name,
      ...(effort.description === undefined ? {} : { description: effort.description }),
    })),
  ], [reasoning, t])
  const modelLabel = currentChoice?.model.name ?? t('selectModel')
  const speedSupported = (state.current?.provider === 'openai-codex' || state.current?.provider === 'codex-oauth') && supportsCodexFastMode(state.current?.model)
  const speedWritable = preferenceSnapshot.status === 'ready' && preferenceSnapshot.writable === true
  const fast = speedSupported && preferenceSnapshot.speedMode === SPEED_MODE_FAST
  const verbositySupported = (state.current?.provider === 'openai-codex' || state.current?.provider === 'codex-oauth') && preferenceSnapshot.verbosityModels.includes(state.current?.model)
  const verbosityWritable = preferenceSnapshot.status === 'ready' && preferenceSnapshot.writable === true
  const verbosityItems = [
    { id: OUTPUT_VERBOSITY_DEFAULT, label: t('verbosityDefault'), description: t('verbosityDefaultHint') },
    { id: OUTPUT_VERBOSITY_LOW, label: t('verbosityLow'), description: t('verbosityLowHint') },
    { id: OUTPUT_VERBOSITY_MEDIUM, label: t('verbosityMedium'), description: t('verbosityMediumHint') },
    { id: OUTPUT_VERBOSITY_HIGH, label: t('verbosityHigh'), description: t('verbosityHighHint') },
  ]
  const verbosityLabel = verbosityItems.find(item => item.id === preferenceSnapshot.outputVerbosity)?.label ?? t('verbosityDefault')
  const busy = state.status === 'selecting'

  useEffect(() => {
    if (available) load()
  }, [available, load])
  useEffect(() => {
    if (!open) return undefined
    const closeOutside = event => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
        setPane('root')
      }
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open])
  useEffect(() => {
    if (!speedSupported && pane === 'speed') setPane('root')
    if (!verbositySupported && pane === 'verbosity') setPane('root')
  }, [pane, speedSupported, verbositySupported])
  if (!available) return null

  const close = (restoreFocus = false) => {
    setOpen(false)
    setPane('root')
    if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus())
  }
  const settleSelection = accepted => {
    if (accepted) close(true)
  }
  const chooseModel = selection => {
    if (state.current?.provider === selection.provider && state.current.model === selection.model) {
      close(true)
      return
    }
    void select(selection).then(settleSelection)
  }
  const chooseEffort = effort => {
    if (state.current === null) return
    if (effectiveEffort === effort) {
      close(true)
      return
    }
    void select({
      provider: state.current.provider,
      model: state.current.model,
      ...(effort === undefined ? {} : { reasoningEffort: effort }),
    }).then(settleSelection)
  }
  const chooseSpeed = speedMode => {
    close(true)
    void preference.set({ [SPEED_MODE_FIELD]: speedMode })
  }
  const chooseVerbosity = outputVerbosity => {
    close(true)
    void preference.set({ [OUTPUT_VERBOSITY_FIELD]: outputVerbosity })
  }
  const option = ({ key, label, description, selected, disabled, onClick }) => <button
    key={key}
    type="button"
    role="menuitemradio"
    aria-checked={selected}
    className="codexModelSelectOption"
    disabled={disabled}
    onClick={onClick}
  >
    <span className="codexModelSelectOptionCopy"><span className="codexModelSelectOptionName">{label}</span>{description === undefined ? null : <span className="codexModelSelectOptionDescription">{description}</span>}</span>
    <span className="codexModelSelectCheck">{selected ? <IconCheckOutline16 /> : null}</span>
  </button>
  const cell = (target, label, value) => <button
    type="button"
    role="menuitem"
    className="codexModelSelectCell"
    data-open={pane === target}
    aria-haspopup="menu"
    aria-expanded={pane === target}
    onClick={() => setPane(current => current === target ? 'root' : target)}
  >
    <span className="codexModelSelectCellLabel">{label}</span>
    <span className="codexModelSelectCellValue">{value}</span>
    <IconChevronRightOutline14 className="codexModelSelectCellChevron" />
  </button>

  let submenu = null
  if (pane === 'model') {
    submenu = <div className="codexModelSelectSubmenu" role="menu" aria-label={t('modelLabel')}>
      {state.status === 'loading' ? <div className="codexModelSelectStatus">{t('modelsLoading')}</div> : null}
      {state.error === null ? null : <div className="codexModelSelectError"><span>{fill(t('modelFailed'), { value: state.error })}</span><button className="codexModelSelectRetry" type="button" onClick={load}>{t('modelRetry')}</button></div>}
      {state.failures.map(failure => <div className="codexModelSelectWarning" key={failure.id}>{fill(t('groupFailed'), { name: failure.name, value: failure.message })}</div>)}
      <div className="codexModelSelectGroups scrollable">{state.groups.map(group => <section className="codexModelSelectGroup" role="group" aria-labelledby={`${id}-${group.id}`} key={group.id}>
        <div className="codexModelSelectGroupTitle" id={`${id}-${group.id}`}>{group.name}</div>
        {group.models.map(model => option({
          key: model.id,
          label: model.name,
          description: model.description,
          selected: state.current?.provider === group.id && state.current.model === model.id,
          disabled: busy,
          onClick: () => chooseModel({ provider: group.id, model: model.id }),
        }))}
      </section>)}</div>
      {state.status === 'ready' && choices.length === 0 ? <div className="codexModelSelectEmpty">{t('modelsEmpty')}</div> : null}
    </div>
  } else if (pane === 'effort') {
    submenu = <div className="codexModelSelectSubmenu" role="menu" aria-label={t('effortLabel')}>
      {effortChoices.length === 0 ? <div className="codexModelSelectEmpty">{t('effortsEmpty')}</div> : effortChoices.map(level => option({
        key: level.key,
        label: level.label,
        description: level.description,
        selected: effectiveEffort === level.effort,
        disabled: busy,
        onClick: () => chooseEffort(level.effort),
      }))}
    </div>
  } else if (pane === 'speed') {
    submenu = <div className="codexModelSelectSubmenu" role="menu" aria-label={t('speedTitle')}>
      {option({ key: SPEED_MODE_STANDARD, label: t('speedStandard'), description: t('speedStandardHint'), selected: !fast, disabled: !speedWritable, onClick: () => chooseSpeed(SPEED_MODE_STANDARD) })}
      {option({ key: SPEED_MODE_FAST, label: t('speedFast'), description: t('speedFastHint'), selected: fast, disabled: !speedWritable, onClick: () => chooseSpeed(SPEED_MODE_FAST) })}
    </div>
  } else if (pane === 'verbosity') {
    submenu = <div className="codexModelSelectSubmenu" role="menu" aria-label={t('verbosityTitle')}>
      {verbosityItems.map(item => option({ key: item.id, label: item.label, description: item.description, selected: preferenceSnapshot.outputVerbosity === item.id, disabled: !verbosityWritable, onClick: () => chooseVerbosity(item.id) }))}
    </div>
  }

  return <div className="codexModelSelect" ref={rootRef} onKeyDown={event => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    if (pane === 'root') close(true)
    else setPane('root')
  }}>
    <button
      ref={triggerRef}
      type="button"
      className="codexModelSelectTrigger"
      aria-label={modelLabel}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? `${id}-menu` : undefined}
      title={modelLabel}
      disabled={locked}
      onClick={() => open ? close() : (setPane('root'), setOpen(true), load())}
    >
      {fast && <BoltIcon className="codexModelSelectBolt" aria-hidden="true" />}
      <span className="codexModelSelectLabel">{modelLabel}</span>
      {effortLabel === undefined ? null : <span className="codexModelSelectEffort">{effortLabel}</span>}
      <IconChevronDownOutline14 className="codexModelSelectChevron" />
    </button>
    {open ? <div className="codexModelSelectMenu" id={`${id}-menu`} role="menu" aria-label={t('modelMenuAria')} aria-busy={state.status === 'loading' || busy}>
      {cell('model', t('modelLabel'), modelLabel)}
      {reasoning === undefined ? null : cell('effort', t('effortLabel'), effortLabel)}
      {speedSupported && cell('speed', t('speedTitle'), t(fast ? 'speedFast' : 'speedStandard'))}
      {verbositySupported && cell('verbosity', t('verbosityTitle'), verbosityLabel)}
      {submenu}
    </div> : null}
  </div>
}

function AccountEmail({ candidate, fallback, t, emailVisible, onClick }) {
  if (typeof candidate?.email !== 'string' || candidate.email.length === 0) {
    return <span title={t('emailUnavailable')}>{fallback ?? candidate?.label ?? t('emailUnavailable')}</span>
  }
  return <button
    type="button"
    className="codexSubscriptionEmail"
    aria-label={t(emailVisible ? 'hideEmail' : 'showEmail')}
    aria-pressed={emailVisible}
    onClick={onClick}
  >{emailVisible ? candidate.email : maskEmail(candidate.email)}</button>
}

function AccountCard({ rpc, t, account, setAccount, onSignedOut }) {
  const [flow, setFlow] = useState()
  const [manualCode, setManualCode] = useState('')
  const [adding, setAdding] = useState(false)
  const [removeId, setRemoveId] = useState()
  const [emailVisible, setEmailVisible] = useState(false)
  const accounts = account?.accounts ?? []
  const accountVisibilityKey = `${account?.authenticated === true ? 'signed-in' : 'signed-out'}:${accounts.map(candidate => `${candidate.id ?? ''}:${candidate.active === true}:${candidate.email ?? ''}`).join('|')}`
  const [emailVisibilityKey, setEmailVisibilityKey] = useState(accountVisibilityKey)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState()
  const call = (endpoint, payload = {}) => rpc.call(CHANNEL, endpoint, payload).then(unwrap)

  useEffect(() => {
    if (emailVisibilityKey === accountVisibilityKey) return
    setEmailVisible(false)
    setEmailVisibilityKey(accountVisibilityKey)
  }, [accountVisibilityKey, emailVisibilityKey])

  useEffect(() => {
    if (flow?.id === undefined || ['authenticated', 'failed', 'cancelled'].includes(flow.phase)) return undefined
    const timer = window.setInterval(() => {
      const read = adding
        ? call('login/status', { id: flow.id }).then(async nextFlow => ({
            flow: nextFlow,
            account: nextFlow.phase === 'authenticated' ? await call('status') : undefined,
          }))
        : readLoginProgress({
            flow,
            readFlow: () => call('login/status', { id: flow.id }),
            readAccount: () => call('status'),
          })
      void read.then(next => {
        setFlow(next.flow)
        setError(undefined)
        if (next.account !== undefined) {
          setAccount(next.account)
          onSignedOut()
          setAdding(false)
          setFlow(undefined)
          notifyQuickQuota()
        }
      }).catch(() => setError(t('failed')))
    }, 800)
    return () => window.clearInterval(timer)
  }, [flow?.id, flow?.phase, adding])

  const begin = (method, label) => {
    setFlow(undefined); setBusy(true); setError(undefined)
    const loginLabel = adding && label === undefined ? `Account ${accounts.length + 1}` : label
    void call('login/start', { method, openExternal: true, ...(loginLabel === undefined ? {} : { label: loginLabel }) }).then(setFlow)
      .catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const cancel = () => {
    if (flow?.id === undefined) return
    setBusy(true)
    void call('login/cancel', { id: flow.id }).then(next => {
      setFlow(adding ? undefined : next)
      if (adding) setAdding(false)
      if (adding) return undefined
      return call('status').then(account => {
        if (account.authenticated === true) {
          setAccount(account)
          setFlow({ ...next, phase: 'authenticated', authenticated: true })
          setError(undefined)
          notifyQuickQuota()
        }
      })
    }).catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const submit = event => {
    event.preventDefault()
    if (flow?.id === undefined || manualCode.trim() === '') return
    setBusy(true)
    void call('login/submit', { id: flow.id, value: manualCode.trim() }).then(next => {
      setManualCode(''); setFlow(next)
    }).catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const logout = () => {
    setBusy(true); setError(undefined)
    void call('logout').then(next => {
      setAccount(next); setFlow(undefined); onSignedOut(); notifyQuickQuota()
    }).catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const selectAccount = id => {
    setBusy(true); setError(undefined)
    void call('account/select', { id }).then(next => {
      setAccount(next); onSignedOut(); notifyQuickQuota()
    }).catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const removeAccount = id => {
    if (removeId !== id) { setRemoveId(id); return }
    setBusy(true); setError(undefined)
    void call('account/remove', { id }).then(next => {
      setAccount(next); setRemoveId(undefined); onSignedOut(); notifyQuickQuota()
    }).catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const signedIn = account?.authenticated === true
  const accountReady = account !== undefined
  const loginVisible = flow !== undefined && !['authenticated', 'failed', 'cancelled'].includes(flow.phase)

  const toggleEmail = () => {
    setEmailVisibilityKey(accountVisibilityKey)
    setEmailVisible(value => emailVisibilityKey === accountVisibilityKey ? !value : true)
  }
  const emailVisibleForAccount = emailVisible && emailVisibilityKey === accountVisibilityKey
  return <div className="codexSubscriptionCard">
    <div className="codexSubscriptionAccountRow">
      <div className="codexSubscriptionStatus" role="status" aria-live="polite"><span className="codexSubscriptionDot" data-state={accountReady ? signedIn ? 'connected' : 'disconnected' : 'loading'} aria-hidden="true" />{accountReady ? signedIn ? t('connected') : t('disconnected') : t('accountLoading')}</div>
      <div className="codexSubscriptionActions">{signedIn ? <><Button type="button" variant="outline" disabled={busy || loginVisible} onClick={() => { setFlow(undefined); setAdding(true) }}>{t('addAccount')}</Button><Button type="button" variant="outline" disabled={busy || loginVisible} onClick={logout}>{t('signOutAll')}</Button></> : accountReady && (flow === undefined || ['failed', 'cancelled'].includes(flow.phase)) ? <><Button type="button" variant="primary" disabled={busy} onClick={() => begin('browser')}>{t('browserLogin')}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => begin('device_code')}>{t('deviceLogin')}</Button></> : null}</div>
    </div>
     {signedIn && accounts.length > 0 ? <div className="codexSubscriptionAccounts">{accounts.map(candidate => <div className="codexSubscriptionAccount" data-active={candidate.active} key={candidate.id}><AccountEmail candidate={candidate} fallback={candidate.label} t={t} emailVisible={emailVisibleForAccount} onClick={toggleEmail} /><div className="codexSubscriptionActions">{candidate.active ? null : <Button type="button" variant="outline" disabled={busy || loginVisible} onClick={() => selectAccount(candidate.id)}>{t('switchAccount')}</Button>}{accounts.length > 1 ? <Button type="button" variant="outline" disabled={busy || loginVisible} onClick={() => removeAccount(candidate.id)}>{removeId === candidate.id ? t('removeConfirm') : t('removeAccount')}</Button> : null}{removeId === candidate.id ? <Button type="button" variant="outline" disabled={busy} onClick={() => setRemoveId(undefined)}>{t('removeCancel')}</Button> : null}</div></div>)}</div> : null}
    {signedIn && adding && flow === undefined ? <div className="codexSubscriptionFlow"><div className="codexSubscriptionActions"><Button type="button" variant="primary" disabled={busy} onClick={() => begin('browser')}>{t('browserLogin')}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => begin('device_code')}>{t('deviceLogin')}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setAdding(false)}>{t('cancel')}</Button></div></div> : null}
    {flow?.phase === 'waiting_device' ? <div className="codexSubscriptionFlow"><p>{t('deviceHint')}</p><code className="codexSubscriptionCode">{flow.deviceCode?.userCode}</code><a href={flow.deviceCode?.verificationUri} target="_blank" rel="noreferrer">{t('openLogin')}</a><p>{t('waiting')}</p></div> : null}
    {flow?.phase === 'waiting_input' ? <form className="codexSubscriptionFlow" onSubmit={submit}><p>{t('manualCode')}</p><Input className="codexSubscriptionInput" value={manualCode} onChange={event => setManualCode(event.currentTarget.value)} autoComplete="off" spellCheck={false} /><div className="codexSubscriptionActions"><Button type="submit" variant="primary" disabled={busy || manualCode.trim() === ''}>{t('submit')}</Button><Button type="button" variant="outline" disabled={busy} onClick={cancel}>{t('cancel')}</Button></div></form> : null}
    {flow !== undefined && ['starting', 'waiting_browser'].includes(flow.phase) ? <div className="codexSubscriptionFlow"><p>{t('waiting')}</p>{flow.authUrl === undefined ? null : <a href={flow.authUrl} target="_blank" rel="noreferrer">{t('openLogin')}</a>}<Button type="button" variant="outline" disabled={busy} onClick={cancel}>{t('cancel')}</Button></div> : null}
    {flow?.phase === 'failed' || error !== undefined ? <p className="codexSubscriptionError" role="alert">{error ?? t('failed')}</p> : null}
  </div>
}

function AccountFailureCard({ accountStatus, snapshot, t }) {
  const retrying = snapshot.retrying === true
  return <div className="codexSubscriptionCard codexSubscriptionRecover" role="alert">
    <p className="codexSubscriptionError">{retrying ? t('accountRetrying') : accountStatusErrorText(snapshot.error, t)}</p>
    <Button type="button" variant="outline" disabled={retrying} aria-busy={retrying} onClick={() => { void accountStatus.retry() }}>{retrying ? t('accountRetrying') : t('accountRetry')}</Button>
  </div>
}

function DiagnosticsCard({ rpc, t }) {
  const [report, setReport] = useState()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  const load = () => {
    setBusy(true); setError(false); setCopied(false)
    void rpc.call(CHANNEL, 'diagnostics', {}).then(unwrap).then(setReport)
      .catch(() => setError(true)).finally(() => setBusy(false))
  }
  const copy = () => {
    if (report === undefined) return
    void navigator.clipboard.writeText(JSON.stringify(report, null, 2)).then(() => setCopied(true)).catch(() => setError(true))
  }
  return <div className="codexSubscriptionCard codexSubscriptionDiagnostics">
    <div className="codexSubscriptionSectionHead">
      <div className="codexSubscriptionSectionTitle"><h3>{t('diagnostics')}</h3></div>
      <div className="codexSubscriptionActions"><Button type="button" variant="outline" disabled={busy} onClick={load}>{busy ? t('diagnosticsLoading') : t('diagnosticsLoad')}</Button>{report === undefined ? null : <Button type="button" variant="outline" onClick={copy}>{copied ? t('diagnosticsCopied') : t('diagnosticsCopy')}</Button>}<a className="codexSubscriptionLink" href={SUPPORT_ISSUE_URL} target="_blank" rel="noreferrer">{t('feedbackOpen')}</a></div>
    </div>
    {report === undefined ? null : <pre>{JSON.stringify(report, null, 2)}</pre>}
    {error ? <p className="codexSubscriptionError" role="alert">{t('diagnosticsFailed')}</p> : null}
  </div>
}

function ResetTime({ resetsAt, t }) {
  const date = Number.isSafeInteger(resetsAt) ? validDate(resetsAt * 1_000) : undefined
  if (date === undefined) return <span>{t('resetUnknown')}</span>
  const value = date.toLocaleString(undefined, {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  return <time dateTime={date.toISOString()} title={date.toLocaleString()}>{fill(t('resets'), { value })}</time>
}

function ResetCreditExpiry({ expiresAt, t }) {
  const date = validDate(expiresAt)
  return <span className="codexSubscriptionResetExpiry">{date === undefined ? t('resetCreditExpiryUnknown') : <time dateTime={date.toISOString()} title={date.toLocaleString()}>{fill(t('resetCreditExpires'), { value: date.toLocaleString() })}</time>}</span>
}

function ResetCreditList({ rpc, t, count, nextExpiresAt, initialCredits, refreshKey, hasExhaustedQuota, onConsumed }) {
  const fallbackCredits = initialCredits ?? (nextExpiresAt === undefined ? [] : [{ expiresAt: nextExpiresAt }])
  const [credits, setCredits] = useState(fallbackCredits)
  const [state, setState] = useState('loading')

  useEffect(() => {
    let live = true
    setState('loading')
    setCredits([])
    void rpc.call(CHANNEL, 'reset-credit/inspect', {}).then(unwrap).then(value => {
      if (!live) return
      setCredits(Array.isArray(value.credits) ? value.credits : [])
      setState('ready')
    }).catch(() => {
      if (live) setState('error')
    })
    return () => { live = false }
  }, [rpc, count, refreshKey])

  return <div className="codexSubscriptionResetBalance" aria-label={t('resetCredits')}>
    {credits.length === 0 ? <p className="codexSubscriptionCreditNote" role="status">{state === 'loading' ? t('resetCreditExpiryLoading') : t('resetCreditExpiryFailed')}</p> : credits.map((credit, index) => <ResetCreditControl key={credit.ref ?? `pending-${index}`} rpc={rpc} t={t} credit={credit} hasExhaustedQuota={hasExhaustedQuota} onConsumed={onConsumed} />)}
    {state === 'error' ? <p className="codexSubscriptionCreditNote" role="status">{t('resetCreditExpiryFailed')}</p> : null}
  </div>
}

function ResetCreditControl({ rpc, t, credit, hasExhaustedQuota, onConsumed }) {
  const [challenge, setChallenge] = useState()
  const [resetBusy, setResetBusy] = useState(false)
  const [resetAcknowledged, setResetAcknowledged] = useState(false)
  const [resetCountdown, setResetCountdown] = useState(0)
  const [resetError, setResetError] = useState()
  const [resetResult, setResetResult] = useState()

  useEffect(() => {
    if (challenge === undefined) { setResetCountdown(0); return undefined }
    const update = () => setResetCountdown(Math.max(0, Math.ceil((challenge.readyAt - Date.now()) / 1_000)))
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [challenge])

  const prepareReset = () => {
    if (resetBusy || typeof credit.ref !== 'string') return
    setResetBusy(true); setResetError(undefined); setResetResult(undefined)
    void rpc.call(CHANNEL, 'reset-credit/prepare', { creditRef: credit.ref }).then(unwrap)
      .then(next => { setChallenge(next); setResetAcknowledged(false) })
      .catch(error => setResetError(resetCreditErrorText(error, t)))
      .finally(() => setResetBusy(false))
  }
  const cancelReset = () => {
    if (resetBusy) return
    setChallenge(undefined); setResetAcknowledged(false); setResetError(undefined)
  }
  const resetReady = challenge !== undefined
    && resetAcknowledged && resetCountdown === 0
  const consumeReset = () => {
    if (resetBusy) return
    if (!resetReady) return
    setResetBusy(true); setResetError(undefined); setResetResult(undefined)
    void rpc.call(CHANNEL, 'reset-credit/consume', {
      challengeId: challenge.challengeId,
      acknowledged: resetAcknowledged,
    }).then(unwrap).then(result => {
      setChallenge(undefined); setResetAcknowledged(false)
      const message = result.code === 'reset' ? t('resetSuccess')
        : result.code === 'nothing_to_reset' ? t('resetNothing')
          : result.code === 'no_credit' ? t('resetNoCredit') : t('resetAlready')
      setResetResult(message)
      onConsumed()
    }).catch(error => setResetError(resetCreditErrorText(error, t))).finally(() => setResetBusy(false))
  }

  return <div className="codexSubscriptionResetCard">
    {challenge === undefined ? <>
      <div className="codexSubscriptionResetMeta"><strong>{credit.name ?? t('resetCreditDefaultName')}</strong><ResetCreditExpiry expiresAt={credit.expiresAt} t={t} /></div><div className="codexSubscriptionActions"><Button className="codexSubscriptionResetUse" type="button" variant="outline" disabled={resetBusy || typeof credit.ref !== 'string'} aria-busy={resetBusy} onClick={prepareReset}>{resetBusy ? t('resetPreparing') : t('resetUse')}</Button></div>
    </> : <div className="codexSubscriptionResetFlow" role="group" aria-labelledby="codex-reset-confirm-title">
      <h4 id="codex-reset-confirm-title">{challenge.title ?? t('resetConfirmTitle')}</h4>
      {challenge.description ? <p className="codexSubscriptionResetWarning">{challenge.description}</p> : null}
      <ResetCreditExpiry expiresAt={challenge.creditExpiresAt} t={t} />
      <p className="codexSubscriptionResetWarning">{t(hasExhaustedQuota ? 'resetWarning' : 'resetEarlyWarning')}</p>
      <label className="codexSubscriptionResetCheck"><input type="checkbox" checked={resetAcknowledged} disabled={resetBusy} onChange={event => setResetAcknowledged(event.target.checked)} /><span>{t('resetAcknowledge')}</span></label>
      {resetCountdown > 0 ? <p className="codexSubscriptionCreditNote" role="status">{fill(t('resetWait'), { count: resetCountdown })}</p> : null}
      <div className="codexSubscriptionActions"><Button type="button" variant="outline" disabled={resetBusy} onClick={cancelReset}>{t('cancel')}</Button><Button className="codexSubscriptionResetFinal" type="button" variant="outline" disabled={!resetReady || resetBusy} aria-busy={resetBusy} onClick={consumeReset}>{resetBusy ? t('resetUsing') : t('resetFinal')}</Button></div>
    </div>}
    {resetResult ? <p className="codexSubscriptionResetResult" role="status">{resetResult}</p> : null}
    {resetError ? <p className="codexSubscriptionError" role="alert">{resetError || t('resetFailed')}</p> : null}
  </div>
}

function resetCreditErrorText(error, t) {
  const key = new Map([
    ['ChatGPT subscription is not signed in', 'resetRenewLogin'],
    ['ChatGPT sign-in needs to be renewed', 'resetRenewLogin'],
    ['No quota reset is available', 'resetNoCredit'],
    ['No usable quota reset is available', 'resetNoCredit'],
    ['The available quota reset expires too soon', 'resetExpired'],
    ['This quota reset confirmation is no longer valid', 'resetExpired'],
    ['This quota reset is already in progress', 'resetInProgress'],
    ['Wait before confirming this quota reset', 'resetTooEarly'],
    ['You must acknowledge that this may consume one quota reset', 'resetAcknowledgeRequired'],
    ['The signed-in ChatGPT account changed', 'resetAccountChanged'],
    ['Quota reset result is uncertain; retry this confirmation to check the same request', 'resetUncertain'],
  ]).get(error instanceof Error ? error.message : '')
  return t(key ?? 'resetFailed')
}

function UsageCard({ rpc, t, signedIn, resetKey }) {
  const [usage, setUsage] = useState()
  const [usageRefreshGeneration, setUsageRefreshGeneration] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState()
  const request = useRef(0)
  const load = force => {
    if (!signedIn) return
    const id = ++request.current
    setBusy(true); setError(undefined)
    void rpc.call(CHANNEL, 'usage', { force }).then(unwrap)
      .then(next => {
        if (request.current === id) {
          setUsage(next)
          setUsageRefreshGeneration(value => value + 1)
          if (force) notifyQuickQuota()
        }
      })
      .catch(error => { if (request.current === id) setError(error.message) })
      .finally(() => { if (request.current === id) setBusy(false) })
  }
  useEffect(() => {
    if (signedIn) load(false)
    else { request.current += 1; setUsage(undefined); setError(undefined); setBusy(false) }
    return () => { request.current += 1 }
  }, [signedIn, resetKey])
  const visibleUsage = signedIn ? usage : undefined
  const limits = visibleUsage?.rateLimits ?? []
  const exhausted = limits.some(limit => limit.id !== 'code_review'
    && limit.windows.some(window => window.usedPercent >= 100))
  const hasUsageDetails = limits.length > 0 || visibleUsage?.credits !== undefined
    || visibleUsage?.individualLimit !== undefined || visibleUsage?.resetCredits?.availableCount > 0
  const fetchedAt = typeof visibleUsage?.fetchedAt === 'number' ? validDate(visibleUsage.fetchedAt) : undefined
  return <div className="codexSubscriptionCard codexSubscriptionUsageCard">
    <div className="codexSubscriptionSectionHead">
      <div className="codexSubscriptionSectionTitle"><h3>{t('usage')}</h3>{fetchedAt === undefined ? null : <time className="codexSubscriptionFreshness" dateTime={fetchedAt.toISOString()}>{fill(t('usageUpdated'), { value: fetchedAt.toLocaleString() })}</time>}</div>
      <Button className="codexSubscriptionRefresh" type="button" variant="outline" disabled={!signedIn || busy} aria-busy={busy} onClick={() => load(true)}>{busy ? t('refreshing') : t('refresh')}</Button>
    </div>
    <div aria-live="polite">
      {!signedIn ? <p className="codexSubscriptionEmpty">{t('noUsage')}</p> : null}
      {signedIn && busy && usage === undefined ? <p className="codexSubscriptionEmpty" role="status">{t('usageLoading')}</p> : null}
      {signedIn && !busy && error === undefined && usage !== undefined && !hasUsageDetails ? <p className="codexSubscriptionEmpty" role="status">{t('usageEmpty')}</p> : null}
    </div>
    {error === undefined ? null : <p className="codexSubscriptionError" role="alert">{error}</p>}
    {visibleUsage?.spendControlReached === true ? <p className="codexSubscriptionError" role="alert">{t('spendReached')}</p> : null}
    {limits.length === 0 ? null : <div className="codexSubscriptionLimits">{limits.flatMap(limit => limit.windows.map((window, index) => <div className="codexSubscriptionLimit" key={`${limit.id}-${window.windowSeconds}-${index}`}>
        <div className="codexSubscriptionLimitTop"><span className="codexSubscriptionLimitLabel">{limit.name ?? limit.id}</span><strong>{percent(window.remainingPercent)}%</strong></div>
        <progress max="100" value={window.remainingPercent} aria-label={`${limit.name ?? limit.id} ${fill(t('remaining'), { value: percent(window.remainingPercent) })}`} />
        <div className="codexSubscriptionLimitMeta"><span>{formatQuotaForecast(window.forecast, t) ?? windowLabel(window.windowSeconds, t)}</span><ResetTime resetsAt={window.resetsAt} t={t} /></div>
      </div>))}</div>}
    {visibleUsage?.credits === undefined && visibleUsage?.individualLimit === undefined && !(visibleUsage?.resetCredits?.availableCount > 0) ? null : <div className="codexSubscriptionCreditSection">
      <p className="codexSubscriptionCreditNote">{t('creditsNote')}</p>
      <div className="codexSubscriptionCreditRows">
        {visibleUsage?.credits ? <div className="codexSubscriptionCreditBalance"><span>{t('creditsBalance')}</span><strong>{visibleUsage.credits.unlimited ? t('unlimited') : `${visibleUsage.credits.balance ?? t('unavailable')} ${t('creditsUnit')}`}</strong></div> : null}
         {visibleUsage?.resetCredits?.availableCount > 0 ? <div className="codexSubscriptionCreditBalance"><span>{t('resetCredits')}</span><ResetCreditList rpc={rpc} t={t} count={visibleUsage.resetCredits.availableCount} nextExpiresAt={visibleUsage.resetCredits.nextExpiresAt} initialCredits={visibleUsage.resetCredits.credits} refreshKey={`${resetKey}:${usageRefreshGeneration}`} hasExhaustedQuota={exhausted} onConsumed={() => load(true)} /></div> : null}
        {visibleUsage?.individualLimit ? <div className="codexSubscriptionSpendLimit">
          <div className="codexSubscriptionSpendTop"><span className="codexSubscriptionCreditLabel">{t('monthlyCreditLimit')}</span><strong>{fill(t('remaining'), { value: percent(visibleUsage.individualLimit.remainingPercent) })}</strong></div>
          <progress max="100" value={visibleUsage.individualLimit.remainingPercent} aria-label={`${t('monthlyCreditLimit')} ${fill(t('remaining'), { value: percent(visibleUsage.individualLimit.remainingPercent) })}`} />
          <div className="codexSubscriptionLimitMeta"><span>{fill(t('creditsUsed'), { used: visibleUsage.individualLimit.used, limit: visibleUsage.individualLimit.limit })}</span><ResetTime resetsAt={visibleUsage.individualLimit.resetsAt} t={t} /></div>
        </div> : null}
      </div>
    </div>}
  </div>
}

function CodexSection({ preference, rpc, accountStatus, t }) {
  const accountSnapshot = useAccountStatusSnapshot(accountStatus)
  const account = accountSnapshot.account
  const [resetKey, setResetKey] = useState(0)
  const setAccount = accountStatus.acceptAccount
  const accountChanged = () => {
    setResetKey(value => value + 1)
    void preference.refreshModels()
  }
  useEffect(() => {
    void accountStatus.load()
    void preference.refreshModels()
  }, [accountStatus, preference])
  return <section className="codexSubscription">
    <div className="codexSubscriptionHead"><h2>{t('title')}</h2></div>
    {accountSnapshot.status === 'error' ? <AccountFailureCard accountStatus={accountStatus} snapshot={accountSnapshot} t={t} /> : <AccountCard rpc={rpc} t={t} account={account} setAccount={setAccount} onSignedOut={accountChanged} />}
    <PreferencesCard preference={preference} t={t} />
    {account === undefined ? null : <UsageCard rpc={rpc} t={t} signedIn={account.authenticated === true} resetKey={resetKey} />}
    <DiagnosticsCard rpc={rpc} t={t} />
  </section>
}

export function apply(ctx) {
  const imageViewer = new SubscriptionImageViewerService()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'codex-subscription: copy')
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-codex-subscription'
    tag.textContent = STYLE + SUBSCRIPTION_IMAGE_VIEWER_CSS
    document.head.append(tag)
    return () => tag.remove()
  }, 'codex-subscription: style')
  const connection = ctx.get('connection')
  const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE })
  const preference = createPreferenceController(scope, connection.rpc)
  const accountStatus = createAccountStatusController(connection.rpc)
  ctx.effect(() => {
    void preference.load()
    void accountStatus.load()
    const disposeReset = ctx.on('connection/reset', () => { void preference.load(); void preference.refreshModels(); void accountStatus.reload() })
    return () => {
      disposeReset?.()
      preference.dispose()
      accountStatus.dispose()
    }
  }, 'codex-subscription: preferences and account status')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'codex-subscription-image-viewer', order: 20,
    inject: () => ({ service: imageViewer, t }),
  }, SubscriptionImageViewerOverlay))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'codex-subscription', order: 15,
    label: () => t('nav'), locale: NS, inject: () => ({ preference, rpc: connection.rpc, accountStatus, t }),
  }, CodexSection))
  const sessions = ctx.get('sessions')
  const installDirectorySlots = scope => {
    const modelDirectories = scope.get('modelDirectories')
    scope.slots.inject('conversation.input.right', () => scope.slots.register({
      name: 'conversation.input.right', id: 'codex-subscription-quota', order: 15,
      locale: NS,
      inject: sessionId => ({
        preference,
        rpc: connection.rpc,
        t,
        directory: modelDirectories.directoryFor(sessionId).store,
      }),
    }, CodexComposerQuota))
    scope.slots.inject('conversation.input.model', () => scope.slots.register({
      name: 'conversation.input.model', priority: -10, locale: NS,
      inject: sessionId => {
        const directory = modelDirectories.directoryFor(sessionId)
        const available = sessions.subagentAddress(sessionId) === undefined
        return {
          available,
          directory: directory.store,
          load: () => { if (available) void directory.load() },
          select: selection => available ? directory.select(selection).then(() => true, () => false) : Promise.resolve(false),
          preference,
        }
      },
    }, CodexModelSelect))
  }
  if (ctx.get('remote.session') === undefined) installDirectorySlots(ctx)
  else ctx.inject(['remote.session'], installDirectorySlots)
  const conversation = ctx.get('conversation')
  const uiConversation = ctx.get('uiConversation')
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key: 'codex_image_generate', locale: NS,
    inject: sessionId => ({
      sessionId,
      rpc: connection.rpc,
      t,
      loadImage: attachment => uiConversation.imageUrl(sessionId, attachment),
      getImageViewer: () => {
        try {
          return ctx.get('nativeImageViewer')
        } catch {
          return undefined
        }
      },
      getInternalImageViewer: () => imageViewer,
      attachForEdit: async (src, filename, draft, annotations = [], referenceName) => {
        const actx = sessions.scope(sessionId)
        if (actx === undefined || typeof conversation.createDraftImages !== 'function' || conversation.input?.for === undefined) {
          throw new Error('This DSH version does not provide the image composer bridge')
        }
        const response = await fetch(src)
        if (!response.ok) throw new Error('Could not read generated image')
        const blob = await response.blob()
        const files = [new File([blob], filename, { type: blob.type || 'image/png' })]
        if (annotations.length > 0) {
          const reference = await createAnnotatedImageReference(blob, annotations)
          files.push(new File([reference], referenceName, { type: 'image/png' }))
        }
        const created = conversation.createDraftImages(files)
        const input = conversation.input.for(actx)
        if (!input.addImages(created.map(item => item.id))) {
          conversation.releaseDraftImages(created)
          throw new Error('The composer is busy')
        }
        sessions.open(sessionId)
        input.setDraft(draft)
      },
    }),
  }, CodexImageToolRow))
}
