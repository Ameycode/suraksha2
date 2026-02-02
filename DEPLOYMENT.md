# Suraksha - Deployment Guide

## Project Structure

```
Suraksha-1/
├── backend/              # Python FastAPI backend
│   ├── models/          # ML model files
│   ├── data/            # Dataset files
│   ├── psi_server.py    # Main server file
│   ├── requirements.txt # Python dependencies
│   ├── runtime.txt      # Python version
│   └── Procfile         # Process configuration
├── frontend/            # React + Vite frontend
│   ├── src/            # Source files
│   │   ├── components/ # React components
│   │   ├── services/   # API services
│   │   ├── App.tsx     # Main app component
│   │   └── ...
│   ├── package.json    # Node dependencies
│   └── vite.config.ts  # Vite configuration
├── render.yaml         # Render deployment config
└── README.md          # This file
```

## Deploying to Render

### Prerequisites

1. A Render account (https://render.com)
2. Your repository pushed to GitHub
3. Gemini API key

### Deployment Steps

#### Option 1: Using render.yaml (Recommended)

1. **Push your code to GitHub**
   ```bash
   git add .
   git commit -m "Restructured for Render deployment"
   git push origin main
   ```

2. **Connect to Render**
   - Go to https://dashboard.render.com
   - Click "New" → "Blueprint"
   - Connect your GitHub repository
   - Render will automatically detect `render.yaml`

3. **Set Environment Variables**
   
   For **suraksha-backend**:
   - `GEMINI_API_KEY`: Your Gemini API key
   
   For **suraksha-frontend**:
   - `VITE_API_URL`: Will be auto-set to your backend URL
   - `VITE_GEMINI_API_KEY`: Your Gemini API key

4. **Deploy**
   - Click "Apply" to create both services
   - Wait for deployment to complete

#### Option 2: Manual Deployment

**Backend:**
1. New Web Service
2. Connect repository
3. Set:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn psi_server:app --host 0.0.0.0 --port $PORT`
   - **Environment**: Python 3.11

**Frontend:**
1. New Static Site
2. Connect repository
3. Set:
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`

### Environment Variables Reference

#### Backend (.env)
```env
GEMINI_API_KEY=your_actual_api_key
PYTHON_ENV=production
```

#### Frontend (.env)
```env
VITE_API_URL=https://your-backend-url.onrender.com
VITE_GEMINI_API_KEY=your_actual_api_key
NODE_ENV=production
```

## Local Development

### Backend

```bash
cd backend
pip install -r requirements.txt
python psi_server.py
# Server runs on http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# App runs on http://localhost:3000
```

## Important Notes

1. **API Keys**: Never commit `.env` files with real API keys
2. **CORS**: Backend is configured to allow all origins (`*`) - restrict this in production
3. **Model Files**: The ML model files (`.pkl`) are included in the repo. For larger models, consider using Git LFS
4. **Backend URL**: Update `VITE_API_URL` in frontend environment variables to match your deployed backend URL

## Troubleshooting

### Backend Issues

- **Module not found**: Ensure all dependencies are in `requirements.txt`
- **Model loading error**: Check that `models/` and `data/` directories exist in backend
- **Port binding**: Render automatically sets `$PORT` - don't hardcode it

### Frontend Issues

- **Build fails**: Check Node version compatibility
- **API calls fail**: Verify `VITE_API_URL` points to correct backend
- **Environment variables not working**: Ensure they're prefixed with `VITE_`

## Support

For issues, please check:
1. Render deployment logs
2. Browser console for frontend errors
3. Backend API logs for server errors
