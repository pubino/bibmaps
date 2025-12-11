# BibMaps Azure Deployment Guide

This guide explains how to deploy BibMaps to Azure Container Apps using the provided deployment script.

## Prerequisites

1. **Azure CLI** - Install from https://docs.microsoft.com/en-us/cli/azure/install-azure-cli
2. **Docker** - Install from https://docs.docker.com/get-docker/
3. **Azure Subscription** - An active Azure subscription with permissions to create resources
4. **Permissions** - For Entra ID setup, you need permission to create App Registrations

## Quick Start

```bash
# New deployment (will prompt for Entra ID setup)
./scripts/deploy-azure.sh

# Update existing deployment (skip auth prompts)
./scripts/deploy-azure.sh --update

# Preview what would be deployed
./scripts/deploy-azure.sh --dry-run

# Destroy all resources
./scripts/deploy-azure.sh --destroy
```

## Script Options

| Option | Description |
|--------|-------------|
| (none) | New deployment with Entra ID configuration prompts |
| `--update` | Update existing deployment (rebuild image, skip auth setup) |
| `--dry-run` | Show what would be done without making changes |
| `--destroy` | Tear down all Azure resources |
| `--help`, `-h` | Show help message |

## Environment Variables

You can customize the deployment using environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `BIBMAPS_RESOURCE_GROUP` | `bibmaps-rg` | Azure Resource Group name |
| `BIBMAPS_LOCATION` | `eastus` | Azure region |
| `BIBMAPS_ACR_NAME` | `bibmapsacr` | Container Registry name |
| `BIBMAPS_ENV_NAME` | `bibmaps-env` | Container App Environment name |
| `BIBMAPS_APP_NAME` | `bibmaps` | Container App name |
| `BIBMAPS_IMAGE_TAG` | `latest` | Docker image tag |

Example:
```bash
BIBMAPS_RESOURCE_GROUP=my-bibmaps-rg BIBMAPS_LOCATION=westus2 ./scripts/deploy-azure.sh
```

## What Gets Deployed

The script automatically registers required Azure resource providers and creates the following resources:

**Resource Providers** (registered automatically if needed):
- `Microsoft.ContainerRegistry` - For Azure Container Registry
- `Microsoft.App` - For Azure Container Apps
- `Microsoft.OperationalInsights` - For logging and monitoring

**Azure Resources**:
1. **Resource Group** - Container for all BibMaps resources
2. **Azure Container Registry (ACR)** - Stores the Docker image
3. **Container App Environment** - Managed Kubernetes environment
4. **Container App** - The running BibMaps application
5. **Entra ID App Registration** (optional) - For Microsoft account authentication

### Resource Configuration

- **Container App CPU**: 0.5 cores
- **Container App Memory**: 1 GB
- **Min Replicas**: 0 (scales to zero when idle)
- **Max Replicas**: 3 (auto-scales based on traffic)
- **Port**: 8000 (HTTP)

## Entra ID Authentication

BibMaps uses Microsoft Entra ID (formerly Azure AD) for user authentication. This allows users to sign in with their Microsoft accounts (work, school, or personal).

**Important**: Self-registration is disabled. Users must:
1. Sign in via Microsoft/Entra ID, or
2. Be created by an administrator

### First User Becomes Admin

The first user to sign in will automatically become an administrator. This admin can then:
- Manage other users
- Control who can access the app via the **Allowed Emails** list

### Allowed Emails List

Administrators can restrict access by adding email patterns to the allowlist:
- **Exact email**: `user@example.com` - Only this specific user
- **Domain wildcard**: `*@example.com` - All users from that domain

If no entries are in the allowlist, anyone with a valid Microsoft account can sign in.

### Automated Setup

During deployment, the script will ask if you want to configure Entra ID:

1. If you choose **Yes**, the script will:
   - Check for existing App Registrations named "BibMaps"
   - Create a new App Registration if needed
   - Generate a client secret (valid for 2 years)
   - Configure Container App authentication

2. If you choose **No**:
   - The app will run in local-only mode
   - You can enable Entra ID later by running the script again

### Manual Entra ID Setup

If automated setup fails or you prefer manual configuration:

#### Step 1: Create App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Microsoft Entra ID** > **App registrations**
3. Click **New registration**
4. Configure:
   - **Name**: `BibMaps`
   - **Supported account types**: Choose based on your needs:
     - "Accounts in this organizational directory only" (single tenant)
     - "Accounts in any organizational directory and personal Microsoft accounts" (multi-tenant + personal)
   - **Redirect URI**:
     - Type: Web
     - URL: `https://<your-app-url>/.auth/login/aad/callback`
5. Click **Register**
6. Note the **Application (client) ID**

#### Step 2: Create Client Secret

1. In your App Registration, go to **Certificates & secrets**
2. Click **New client secret**
3. Add a description and expiration
4. Click **Add**
5. **Copy the secret value immediately** (it won't be shown again)

#### Step 3: Configure Container App Authentication

```bash
# Set variables
RESOURCE_GROUP="bibmaps-rg"
APP_NAME="bibmaps"
CLIENT_ID="<your-app-registration-client-id>"
CLIENT_SECRET="<your-client-secret>"
TENANT_ID="<your-tenant-id>"

# Configure authentication
az containerapp auth microsoft update \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --client-id "$CLIENT_ID" \
    --client-secret "$CLIENT_SECRET" \
    --tenant-id "$TENANT_ID" \
    --issuer "https://login.microsoftonline.com/$TENANT_ID/v2.0" \
    --yes
```

#### Step 4: Set Authentication Mode

Choose how unauthenticated requests are handled:

```bash
# Option A: Allow anonymous access (recommended for BibMaps)
# Users can browse without signing in, but need to sign in for certain features
az containerapp auth update \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --unauthenticated-client-action AllowAnonymous

# Option B: Require authentication
# All users must sign in before accessing the app
az containerapp auth update \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --unauthenticated-client-action RedirectToLoginPage
```

## Deployment Modes

### New Deployment

```bash
./scripts/deploy-azure.sh
```

- Creates all Azure resources
- Prompts for Entra ID configuration
- Builds and deploys the application

### Update Existing Deployment

```bash
./scripts/deploy-azure.sh --update
```

- Rebuilds the Docker image
- Pushes to Container Registry
- Updates the Container App
- Skips Entra ID configuration prompts

### Dry Run

```bash
./scripts/deploy-azure.sh --dry-run
```

Shows what would happen without making any changes. Useful for:
- Verifying configuration before deployment
- Checking if resources already exist

## Updating the Application

After making code changes:

```bash
# Recommended: Use the update flag
./scripts/deploy-azure.sh --update

# Or manually:
docker build -t <acr-login-server>/bibmaps:latest .
docker push <acr-login-server>/bibmaps:latest
az containerapp update \
    --name bibmaps \
    --resource-group bibmaps-rg \
    --image <acr-login-server>/bibmaps:latest
```

## Destroying Resources

To remove all Azure resources:

```bash
./scripts/deploy-azure.sh --destroy
```

This will:
1. Check for an existing Entra ID App Registration and prompt to delete it
2. Show all resources in the Resource Group
3. Display a summary of what will be deleted
4. Require you to type `DELETE` to confirm
5. Delete the Entra ID App Registration (if requested)
6. Delete the entire Resource Group (and all contents)

Example destroy flow:
```
Found Entra ID App Registration:
  App ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

Also delete the Entra ID App Registration 'BibMaps'? (y/n): y

Summary of deletions:
  - Resource Group: bibmaps-rg (and all contents)
  - Entra ID App: BibMaps (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)

Type 'DELETE' to confirm: DELETE
```

If you choose not to delete the Entra ID App Registration, you can delete it later:
```bash
# Via CLI
az ad app delete --id <app-id>

# Or via Azure Portal
# Azure Portal > Microsoft Entra ID > App registrations > BibMaps > Delete
```

## Viewing Logs

```bash
az containerapp logs show \
    --name bibmaps \
    --resource-group bibmaps-rg \
    --follow
```

## Troubleshooting

### "Not logged in to Azure"

Run `az login` to authenticate with Azure.

### "Container Registry name already exists"

ACR names must be globally unique. Choose a different name using the `BIBMAPS_ACR_NAME` environment variable.

### "Insufficient permissions"

Ensure your Azure account has the Contributor role on the subscription.

### "MissingSubscriptionRegistration" error

This error occurs when required resource providers aren't registered on your subscription. The script now handles this automatically, but if you still encounter issues:

```bash
# Manually register resource providers
az provider register --namespace Microsoft.ContainerRegistry
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights

# Check registration status
az provider show --namespace Microsoft.ContainerRegistry --query "registrationState"
```

Registration can take a few minutes. Wait until all providers show "Registered" status.

### "Cannot create App Registration"

You need permission to create App Registrations in Entra ID. Contact your Azure administrator or use manual setup with an existing registration.

### Build fails

Ensure Docker is running and you have sufficient disk space.

### Entra ID authentication not working

1. Verify the redirect URI matches your app URL exactly:
   ```bash
   az ad app show --id <app-id> --query web.redirectUris
   ```

2. Check the Container App auth configuration:
   ```bash
   az containerapp auth show --name bibmaps --resource-group bibmaps-rg
   ```

3. Ensure the client secret hasn't expired

### App not accessible

1. Check the Container App is running:
   ```bash
   az containerapp show --name bibmaps --resource-group bibmaps-rg --query "properties.runningStatus"
   ```

2. Check the logs for errors

3. Verify ingress is enabled:
   ```bash
   az containerapp show --name bibmaps --resource-group bibmaps-rg --query "properties.configuration.ingress"
   ```

## Cost Estimation

Azure Container Apps charges based on:
- **vCPU seconds**: ~$0.000024 per vCPU-second
- **Memory**: ~$0.000003 per GiB-second
- **Requests**: First 2 million requests/month free

With `min-replicas: 0`, the app scales to zero when not in use, minimizing costs.

| Resource | Estimated Cost |
|----------|---------------|
| Azure Container Registry (Basic) | ~$5/month |
| Container App (light usage) | ~$0-10/month |
| Entra ID | Free (included with Azure) |

**Estimated monthly cost for light usage: $5-15/month**

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Azure Resource Group                      │
│                                                              │
│  ┌─────────────────┐    ┌─────────────────────────────────┐│
│  │   Container     │    │  Container App Environment       ││
│  │   Registry      │    │                                  ││
│  │   (ACR)         │───▶│  ┌─────────────────────┐        ││
│  │                 │    │  │   Container App     │        ││
│  │  bibmaps:latest │    │  │   (BibMaps)         │        ││
│  └─────────────────┘    │  │                     │        ││
│                         │  │  Port 8000          │        ││
│                         │  │  0.5 CPU / 1GB RAM  │        ││
│                         │  └─────────────────────┘        ││
│                         │            │                     ││
│                         │            │ Easy Auth           ││
│                         │            ▼                     ││
│                         │  ┌─────────────────────┐        ││
│                         │  │  Authentication     │        ││
│                         │  │  (Entra ID)         │        ││
│                         │  └─────────────────────┘        ││
│                         └──────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                                      │
                              HTTPS (external)
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Microsoft Entra ID                        │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  App Registration: BibMaps                            │   │
│  │  - Client ID                                          │   │
│  │  - Client Secret                                      │   │
│  │  - Redirect URIs                                      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Security Considerations

1. **Client Secrets**: Store securely; rotate before expiration (2 years by default)
2. **HTTPS**: Always enabled via Container Apps ingress
3. **Authentication**: Consider requiring authentication for sensitive data
4. **Network**: Consider adding IP restrictions for additional security

## Support

For issues with:
- **This deployment script**: Open an issue in the BibMaps repository
- **Azure Container Apps**: [Azure documentation](https://learn.microsoft.com/en-us/azure/container-apps/)
- **Entra ID**: [Entra ID documentation](https://learn.microsoft.com/en-us/entra/identity/)
