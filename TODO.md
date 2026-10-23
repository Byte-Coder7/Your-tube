# Comment Section Enhancement - Implementation Steps

## Backend (server/)
- [x] Inspect existing codebase
- [x] 1. Update `Modals/comment.js` - add likes, dislikes, reports, flagged, optional location with visibility
- [x] 2. Create `Modals/commentReaction.js` - per-user reaction tracking (like/dislike/report) with unique index
- [x] 3. Create `utils/moderation.js` - abusive word/spam/special-char detection
- [x] 4. Create `utils/translate.js` - backend translation proxy (Google Translate free endpoint)
- [x] 5. Update `controllers/comment.js` - moderation on post, like/dislike/report/reaction-status/translate endpoints
- [x] 6. Update `routes/comment.js` - register new endpoints

## Frontend (yourtube/)
- [x] 7. Update `components/Comments.tsx` - username/time, optional location, Translate, Like/Dislike, Report, toasts, loading states

## Testing & Verification
- [x] 8. Backend syntax verified (`node --check`)
- [x] 9. Frontend TypeScript verified (`tsc --noEmit` passed)
