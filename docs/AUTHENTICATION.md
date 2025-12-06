# BibMap Authentication & Authorization

BibMap supports multiple authentication methods for flexible deployment options.

## Authentication Methods

### 1. Local Authentication (Default)

Local authentication uses username/password credentials stored in the database.

**Setup:**
- No additional configuration required
- First user to register becomes an administrator
- Subsequent users are standard users by default
- Admins can create users with specific roles

**Environment Variables:**
```bash
# JWT token configuration
SECRET_KEY=your-secret-key-change-in-production  # Required in production
ACCESS_TOKEN_EXPIRE_MINUTES=1440  # Token expiration (default: 24 hours)
```

### 2. Azure Easy Auth

Azure App Service Easy Auth provides authentication via Azure Active Directory without code changes.

**Setup:**

1. **Deploy to Azure App Service:**
   ```bash
   az webapp create --name bibmap-app --resource-group myResourceGroup --plan myPlan
   ```

2. **Configure Easy Auth in Azure Portal:**
   - Go to your App Service → Authentication
   - Add identity provider → Microsoft
   - Configure Application (client) ID and tenant
   - Set redirect URLs

3. **Headers provided by Easy Auth:**
   - `X-MS-CLIENT-PRINCIPAL-ID`: User's unique identifier
   - `X-MS-CLIENT-PRINCIPAL-NAME`: User's display name

4. **User Creation:**
   - Users authenticated via Easy Auth need to be created in BibMap
   - Admin can create users matching their Azure AD identity
   - Or implement auto-provisioning (future enhancement)

### 3. Google OAuth (Alternative)

Google OAuth provides single sign-on authentication using Google accounts.

**Setup:**

1. **Create Google OAuth credentials:**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select existing
   - Navigate to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Select "Web application" as the application type
   - Set authorized redirect URIs: `https://your-app.com/api/auth/google/callback`
   - Copy the Client ID and Client Secret

2. **Environment Variables:**
   ```bash
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   GOOGLE_REDIRECT_URI=https://your-app.com/api/auth/google/callback
   ```

3. **How It Works:**
   - Users click "Continue with Google" on the login/register page
   - They are redirected to Google's OAuth consent screen
   - After approval, they are redirected back with an authentication code
   - The app exchanges the code for user info and creates/links an account
   - Users are automatically logged in and redirected to the app

4. **Account Linking:**
   - If a user with the same email already exists, their account is linked to Google
   - New users are auto-created with their Google profile info
   - First user via Google OAuth becomes admin (if no users exist)

5. **Security Notes:**
   - OAuth states are validated to prevent CSRF attacks
   - States expire after 10 minutes
   - The Google OAuth button only appears when credentials are configured

## Role-Based Access Control (RBAC)

### Roles

| Role | Description |
|------|-------------|
| `admin` | Full access to all resources and user management |
| `user` | Standard user with access to own resources |

### Permissions

| Resource | User | Admin |
|----------|------|-------|
| Own BibMaps | CRUD | CRUD |
| Other's BibMaps | - | CRUD |
| Own References | CRUD | CRUD |
| Other's References | - | CRUD |
| Own Taxonomies | CRUD | CRUD |
| Global Taxonomies | Read | CRUD |
| User Management | - | CRUD |

### First User as Admin

The first user to register automatically becomes an administrator. This ensures there's always at least one admin to manage the system.

## API Authentication

### Token-Based (JWT)

Include the token in the Authorization header:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" https://your-app.com/api/bibmaps/
```

### Cookie-Based

After login, a secure HTTP-only cookie is set automatically. Browser clients will include this cookie in requests.

## Endpoints

### Public Endpoints
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login (form data)
- `POST /api/auth/login/json` - Login (JSON body)
- `POST /api/auth/logout` - Logout
- `GET /api/auth/google/enabled` - Check if Google OAuth is configured
- `GET /api/auth/google/login` - Initiate Google OAuth flow (redirects to Google)
- `GET /api/auth/google/callback` - Handle Google OAuth callback
- `GET /api/health` - Health check
- `GET /api/bibmaps/public/{id}` - View published BibMaps

### Authenticated Endpoints
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/me` - Update profile
- `POST /api/auth/change-password` - Change password
- All BibMap, Reference, Node, Connection, Taxonomy CRUD endpoints

### Admin-Only Endpoints
- `GET /api/auth/users` - List all users
- `POST /api/auth/users` - Create user
- `GET /api/auth/users/{id}` - Get user
- `PUT /api/auth/users/{id}` - Update user
- `DELETE /api/auth/users/{id}` - Delete user
- `POST /api/auth/users/{id}/reset-password` - Reset user password
- `POST /api/taxonomies/global` - Create global taxonomy

## Local Development

For local development without authentication:

1. **Anonymous Mode**: When no user is logged in, resources without an owner are accessible. This allows development without authentication.

2. **Test Accounts**: Create test accounts during development:
   ```bash
   # First registration creates admin
   curl -X POST http://localhost:8000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@test.com","username":"admin","password":"testpass123"}'
   ```

## Production Deployment

### Security Checklist

- [ ] Set a strong, unique `SECRET_KEY`
- [ ] Use HTTPS in production
- [ ] Configure CORS appropriately
- [ ] Set appropriate token expiration
- [ ] Enable rate limiting
- [ ] Monitor failed login attempts
- [ ] Regular security audits

### Docker Deployment

```bash
docker run -p 8000:8000 \
  -e SECRET_KEY=your-production-secret \
  -e DATABASE_URL=postgresql://user:pass@host/db \
  -v ./data:/data \
  bibmap
```

### Azure Deployment with Easy Auth

1. Deploy the Docker image to Azure Container Apps or App Service
2. Configure Easy Auth through Azure Portal
3. Set environment variables for database connection
4. The app will automatically use Easy Auth headers

## Troubleshooting

### Common Issues

1. **401 Unauthorized**: Token expired or invalid. Re-login to get a new token.

2. **403 Forbidden**: User doesn't have permission. Check role and resource ownership.

3. **Easy Auth headers missing**: Ensure Easy Auth is properly configured in Azure Portal.

4. **Cookie not set**: Check that the response includes Set-Cookie header and browser is accepting cookies.

### Debug Mode

Enable debug logging:
```bash
export LOG_LEVEL=DEBUG
```
