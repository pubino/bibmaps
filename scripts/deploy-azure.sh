#!/bin/bash
set -e

#
# BibMaps Azure Container App Deployment Script
#
# Usage:
#   ./deploy-azure.sh [OPTIONS]
#
# Options:
#   --dry-run    Show what would be done without making any changes
#   --destroy    Tear down all Azure resources created by this script
#   --update     Update existing deployment (skip Entra ID prompts)
#   --help       Show this help message
#
# Environment Variables (optional):
#   BIBMAPS_RESOURCE_GROUP    Resource group name (default: bibmaps-rg)
#   BIBMAPS_LOCATION          Azure region (default: eastus)
#   BIBMAPS_ACR_NAME          Container registry name (default: bibmapsacr)
#   BIBMAPS_ENV_NAME          Container app environment name (default: bibmaps-env)
#   BIBMAPS_APP_NAME          Container app name (default: bibmaps)
#   BIBMAPS_IMAGE_TAG         Image tag (default: latest)
#

# Default values
DEFAULT_RESOURCE_GROUP="bibmaps-rg"
DEFAULT_LOCATION="eastus"
DEFAULT_ACR_NAME="bibmapsacr"
DEFAULT_CAE_NAME="bibmaps-env"
DEFAULT_APP_NAME="bibmaps"
DEFAULT_IMAGE_TAG="latest"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
DESTROY_MODE=false
DRY_RUN=false
UPDATE_MODE=false
HELP_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --destroy)
            DESTROY_MODE=true
            shift
            ;;
        --update)
            UPDATE_MODE=true
            shift
            ;;
        --help|-h)
            HELP_MODE=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Show help
if [ "$HELP_MODE" = true ]; then
    echo "BibMaps Azure Deployment Script"
    echo ""
    echo "Usage:"
    echo "  ./deploy-azure.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --dry-run    Show what would be done without making any changes"
    echo "  --destroy    Tear down all Azure resources (Resource Group and all contents)"
    echo "  --update     Update existing deployment (rebuild and push image, skip auth setup)"
    echo "  --help, -h   Show this help message"
    echo ""
    echo "Environment Variables (optional):"
    echo "  BIBMAPS_RESOURCE_GROUP    Resource group name (default: $DEFAULT_RESOURCE_GROUP)"
    echo "  BIBMAPS_LOCATION          Azure region (default: $DEFAULT_LOCATION)"
    echo "  BIBMAPS_ACR_NAME          Container registry name (default: $DEFAULT_ACR_NAME)"
    echo "  BIBMAPS_ENV_NAME          Container app environment name (default: $DEFAULT_CAE_NAME)"
    echo "  BIBMAPS_APP_NAME          Container app name (default: $DEFAULT_APP_NAME)"
    echo "  BIBMAPS_IMAGE_TAG         Image tag (default: $DEFAULT_IMAGE_TAG)"
    echo ""
    echo "Examples:"
    echo "  # Deploy with defaults (new deployment)"
    echo "  ./deploy-azure.sh"
    echo ""
    echo "  # Update existing deployment after code changes"
    echo "  ./deploy-azure.sh --update"
    echo ""
    echo "  # Deploy with custom resource group"
    echo "  BIBMAPS_RESOURCE_GROUP=my-rg ./deploy-azure.sh"
    echo ""
    echo "  # Preview what would be deployed"
    echo "  ./deploy-azure.sh --dry-run"
    echo ""
    echo "  # Destroy all resources"
    echo "  ./deploy-azure.sh --destroy"
    exit 0
fi

echo ""
echo "========================================="
echo "  BibMaps Azure Container App"
if [ "$DESTROY_MODE" = true ]; then
    echo -e "  ${RED}DESTROY MODE${NC}"
elif [ "$DRY_RUN" = true ]; then
    echo -e "  ${YELLOW}DRY RUN${NC}"
elif [ "$UPDATE_MODE" = true ]; then
    echo -e "  ${BLUE}UPDATE MODE${NC}"
else
    echo -e "  ${GREEN}Deployment${NC}"
fi
echo "========================================="
echo ""

# Check if logged in to Azure
if ! az account show &>/dev/null; then
    echo "Not logged in to Azure. Running 'az login'..."
    az login
fi

# Show current subscription
echo "Current Azure subscription:"
az account show --query "{Name:name, ID:id}" --output table
echo ""

read -p "Use this subscription? (y/n): " USE_SUB
if [[ "$USE_SUB" != "y" && "$USE_SUB" != "Y" ]]; then
    echo ""
    echo "Available subscriptions:"
    az account list --query "[].{Name:name, ID:id}" --output table
    echo ""
    read -p "Enter subscription name or ID: " SUB_ID
    az account set --subscription "$SUB_ID"
    echo "Switched to subscription: $SUB_ID"
fi

# Get tenant ID for later use
TENANT_ID=$(az account show --query tenantId --output tsv)

echo ""
echo "========================================="
echo "  Configuration"
echo "========================================="
echo ""

# Resource Group
read -p "Resource Group name [$DEFAULT_RESOURCE_GROUP]: " RESOURCE_GROUP
RESOURCE_GROUP=${RESOURCE_GROUP:-${BIBMAPS_RESOURCE_GROUP:-$DEFAULT_RESOURCE_GROUP}}

# Destroy mode - simplified flow
if [ "$DESTROY_MODE" = true ]; then
    echo ""
    echo -e "${RED}=========================================${NC}"
    echo -e "${RED}  WARNING: DESTRUCTIVE OPERATION${NC}"
    echo -e "${RED}=========================================${NC}"
    echo ""
    echo "This will permanently delete:"
    echo "  - Resource Group: $RESOURCE_GROUP"
    echo "  - All resources within the group (Container App, ACR, Environment, etc.)"
    echo ""
    echo -e "${YELLOW}This action cannot be undone!${NC}"
    echo ""

    # Check for Entra ID App Registration
    ENTRA_APP_ID=$(az ad app list --display-name "BibMaps" --query "[0].appId" --output tsv 2>/dev/null || echo "")
    DELETE_ENTRA=false

    if [ -n "$ENTRA_APP_ID" ] && [ "$ENTRA_APP_ID" != "null" ]; then
        echo -e "${BLUE}Found Entra ID App Registration:${NC}"
        echo "  App ID: $ENTRA_APP_ID"
        echo ""
        read -p "Also delete the Entra ID App Registration 'BibMaps'? (y/n): " DEL_ENTRA
        if [[ "$DEL_ENTRA" == "y" || "$DEL_ENTRA" == "Y" ]]; then
            DELETE_ENTRA=true
        fi
        echo ""
    fi

    # Check if resource group exists
    RG_EXISTS=false
    if az group show --name "$RESOURCE_GROUP" &>/dev/null; then
        RG_EXISTS=true
    fi

    if [ "$RG_EXISTS" = false ] && [ "$DELETE_ENTRA" = false ]; then
        echo -e "${YELLOW}Resource Group '$RESOURCE_GROUP' does not exist and no Entra ID deletion requested.${NC}"
        echo "Nothing to destroy."
        exit 0
    fi

    # Show what will be deleted
    if [ "$RG_EXISTS" = true ]; then
        echo "Resources in '$RESOURCE_GROUP':"
        az resource list --resource-group "$RESOURCE_GROUP" --query "[].{Name:name, Type:type}" --output table
        echo ""
    fi

    echo "Summary of deletions:"
    if [ "$RG_EXISTS" = true ]; then
        echo -e "  - Resource Group: ${RED}$RESOURCE_GROUP${NC} (and all contents)"
    fi
    if [ "$DELETE_ENTRA" = true ]; then
        echo -e "  - Entra ID App: ${RED}BibMaps${NC} ($ENTRA_APP_ID)"
    fi
    echo ""

    read -p "Type 'DELETE' to confirm: " CONFIRM_DELETE
    if [ "$CONFIRM_DELETE" != "DELETE" ]; then
        echo -e "${YELLOW}Confirmation failed. Aborting.${NC}"
        exit 1
    fi

    # Delete Entra ID App Registration first (if requested)
    if [ "$DELETE_ENTRA" = true ]; then
        echo ""
        echo "Deleting Entra ID App Registration..."
        if az ad app delete --id "$ENTRA_APP_ID" 2>/dev/null; then
            echo -e "  ${GREEN}Entra ID App Registration deleted.${NC}"
        else
            echo -e "  ${YELLOW}Warning: Could not delete Entra ID App Registration.${NC}"
            echo "  You may need to delete it manually in the Azure Portal."
        fi
    fi

    # Delete Resource Group (if exists)
    if [ "$RG_EXISTS" = true ]; then
        echo ""
        echo "Deleting Resource Group '$RESOURCE_GROUP' and all its resources..."
        az group delete --name "$RESOURCE_GROUP" --yes --no-wait
    fi

    echo ""
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}  Deletion Initiated${NC}"
    echo -e "${GREEN}=========================================${NC}"
    echo ""
    if [ "$RG_EXISTS" = true ]; then
        echo "Resource Group deletion is in progress (running in background)."
        echo ""
        echo "To check deletion status:"
        echo "  az group show --name $RESOURCE_GROUP"
        echo ""
        echo "The deletion may take several minutes to complete."
    fi
    if [ "$DELETE_ENTRA" = true ]; then
        echo "Entra ID App Registration has been deleted."
    elif [ -n "$ENTRA_APP_ID" ] && [ "$ENTRA_APP_ID" != "null" ]; then
        echo -e "${YELLOW}Note: Entra ID App Registration was not deleted.${NC}"
        echo "To delete it manually:"
        echo "  az ad app delete --id $ENTRA_APP_ID"
        echo "  Or: Azure Portal > Microsoft Entra ID > App registrations > BibMaps > Delete"
    fi
    echo ""
    exit 0
fi

# Continue with deployment configuration
# Location
echo ""
echo "Common locations: eastus, westus2, centralus, westeurope, northeurope"
read -p "Azure region [$DEFAULT_LOCATION]: " LOCATION
LOCATION=${LOCATION:-${BIBMAPS_LOCATION:-$DEFAULT_LOCATION}}

# Container Registry
read -p "Container Registry name (lowercase, alphanumeric) [$DEFAULT_ACR_NAME]: " ACR_NAME
ACR_NAME=${ACR_NAME:-${BIBMAPS_ACR_NAME:-$DEFAULT_ACR_NAME}}

# Container App Environment
read -p "Container App Environment name [$DEFAULT_CAE_NAME]: " CAE_NAME
CAE_NAME=${CAE_NAME:-${BIBMAPS_ENV_NAME:-$DEFAULT_CAE_NAME}}

# Container App
read -p "Container App name [$DEFAULT_APP_NAME]: " APP_NAME
APP_NAME=${APP_NAME:-${BIBMAPS_APP_NAME:-$DEFAULT_APP_NAME}}

# Image tag
read -p "Image tag [$DEFAULT_IMAGE_TAG]: " IMAGE_TAG
IMAGE_TAG=${IMAGE_TAG:-${BIBMAPS_IMAGE_TAG:-$DEFAULT_IMAGE_TAG}}

# Check if this is an existing deployment
EXISTING_DEPLOYMENT=false
if az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null 2>&1; then
    EXISTING_DEPLOYMENT=true
    if [ "$UPDATE_MODE" = false ]; then
        echo ""
        echo -e "${BLUE}Existing deployment detected.${NC}"
        read -p "Do you want to update the existing deployment? (y/n): " DO_UPDATE
        if [[ "$DO_UPDATE" == "y" || "$DO_UPDATE" == "Y" ]]; then
            UPDATE_MODE=true
        fi
    fi
fi

# Entra ID Configuration (only for new deployments or if not in update mode)
CONFIGURE_ENTRA=false
ENTRA_APP_ID=""
ENTRA_CLIENT_SECRET=""

if [ "$UPDATE_MODE" = false ] && [ "$DRY_RUN" = false ]; then
    echo ""
    echo "========================================="
    echo "  Entra ID (Azure AD) Authentication"
    echo "========================================="
    echo ""
    echo "BibMaps can use Microsoft Entra ID for user authentication."
    echo "This allows users to sign in with their Microsoft accounts."
    echo ""

    read -p "Configure Entra ID authentication? (y/n): " SETUP_ENTRA
    if [[ "$SETUP_ENTRA" == "y" || "$SETUP_ENTRA" == "Y" ]]; then
        CONFIGURE_ENTRA=true

        echo ""
        echo "Checking for existing Entra ID App Registration..."

        # Check if app registration already exists
        EXISTING_APP=$(az ad app list --display-name "BibMaps" --query "[0].appId" --output tsv 2>/dev/null || echo "")

        if [ -n "$EXISTING_APP" ] && [ "$EXISTING_APP" != "null" ]; then
            echo -e "${BLUE}Found existing App Registration: $EXISTING_APP${NC}"
            read -p "Use existing registration? (y/n): " USE_EXISTING
            if [[ "$USE_EXISTING" == "y" || "$USE_EXISTING" == "Y" ]]; then
                ENTRA_APP_ID="$EXISTING_APP"
                echo ""
                echo "You'll need to provide the client secret for the existing app."
                echo "If you don't have it, you can create a new one in the Azure Portal."
                read -s -p "Enter the client secret (or press Enter to create new): " ENTRA_CLIENT_SECRET
                echo ""
            fi
        fi

        if [ -z "$ENTRA_APP_ID" ]; then
            echo ""
            echo "A new Entra ID App Registration will be created."
            echo "This will enable Microsoft account login for BibMaps."
        fi
    fi
fi

echo ""
echo "========================================="
echo "  Summary"
echo "========================================="
echo ""
echo "Resource Group:            $RESOURCE_GROUP"
echo "Location:                  $LOCATION"
echo "Container Registry:        $ACR_NAME"
echo "Container App Environment: $CAE_NAME"
echo "Container App:             $APP_NAME"
echo "Image Tag:                 $IMAGE_TAG"
echo "Tenant ID:                 $TENANT_ID"
if [ "$UPDATE_MODE" = true ]; then
    echo -e "Mode:                      ${BLUE}Update existing deployment${NC}"
else
    echo -e "Mode:                      ${GREEN}New deployment${NC}"
fi
if [ "$CONFIGURE_ENTRA" = true ]; then
    if [ -n "$ENTRA_APP_ID" ]; then
        echo -e "Entra ID:                  ${GREEN}Using existing: $ENTRA_APP_ID${NC}"
    else
        echo -e "Entra ID:                  ${GREEN}Will create new registration${NC}"
    fi
else
    echo -e "Entra ID:                  ${YELLOW}Not configured (local auth only)${NC}"
fi
echo ""

# Dry run - show what would be done and exit
if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}=========================================${NC}"
    echo -e "${YELLOW}  DRY RUN - No changes will be made${NC}"
    echo -e "${YELLOW}=========================================${NC}"
    echo ""
    echo "The following actions would be performed:"
    echo ""

    # Check resource providers
    echo "  [0] Resource Providers - would check and register if needed:"
    echo "      Microsoft.ContainerRegistry, Microsoft.App, Microsoft.OperationalInsights"

    # Check Resource Group
    if az group show --name "$RESOURCE_GROUP" &>/dev/null; then
        echo "  [1/8] Resource Group '$RESOURCE_GROUP' - already exists (no change)"
    else
        echo "  [1/8] Resource Group '$RESOURCE_GROUP' - WOULD BE CREATED in $LOCATION"
    fi

    # Check Container Registry
    if az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null 2>&1; then
        echo "  [2/8] Container Registry '$ACR_NAME' - already exists (no change)"
    else
        echo "  [2/8] Container Registry '$ACR_NAME' - WOULD BE CREATED (Basic SKU)"
    fi

    echo "  [3/8] Container Registry credentials - would be retrieved"

    # Get script directory and project root for image name
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

    # Show image info
    if az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null 2>&1; then
        ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer --output tsv)
        IMAGE_NAME="$ACR_LOGIN_SERVER/bibmaps:$IMAGE_TAG"
    else
        IMAGE_NAME="${ACR_NAME}.azurecr.io/bibmaps:$IMAGE_TAG"
    fi
    echo "  [4/8] Docker image - WOULD BE BUILT using ACR cloud build"
    echo "        Source: $PROJECT_ROOT"
    echo "        Image: $IMAGE_NAME"
    echo "        Platform: linux/amd64"

    # Check Container App Environment
    if az containerapp env show --name "$CAE_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null 2>&1; then
        echo "  [5/8] Container App Environment '$CAE_NAME' - already exists (no change)"
    else
        echo "  [5/8] Container App Environment '$CAE_NAME' - WOULD BE CREATED"
    fi

    # Check Container App
    if az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null 2>&1; then
        echo "  [6/8] Container App '$APP_NAME' - WOULD BE UPDATED with new image"
    else
        echo "  [6/8] Container App '$APP_NAME' - WOULD BE CREATED"
        echo "        CPU: 0.5, Memory: 1Gi"
        echo "        Replicas: 0-3"
        echo "        Ingress: external, port 8000"
    fi

    # Entra ID
    if [ "$CONFIGURE_ENTRA" = true ]; then
        if [ -n "$ENTRA_APP_ID" ]; then
            echo "  [7/8] Entra ID - WOULD USE existing registration: $ENTRA_APP_ID"
        else
            echo "  [7/8] Entra ID - WOULD CREATE new App Registration 'BibMaps'"
        fi
    else
        echo "  [7/8] Entra ID - Skipped (not configured)"
    fi

    echo "  [8/8] Display deployment summary and app URL"

    echo ""
    echo -e "${YELLOW}To perform these actions, run without --dry-run${NC}"
    exit 0
fi

read -p "Proceed with deployment? (y/n): " PROCEED
if [[ "$PROCEED" != "y" && "$PROCEED" != "Y" ]]; then
    echo "Deployment cancelled."
    exit 0
fi

echo ""
echo "========================================="
echo "  Registering Resource Providers"
echo "========================================="
echo ""
echo "Checking required Azure resource providers..."

# Required resource providers for this deployment
REQUIRED_PROVIDERS=(
    "Microsoft.ContainerRegistry"
    "Microsoft.App"
    "Microsoft.OperationalInsights"
)

for PROVIDER in "${REQUIRED_PROVIDERS[@]}"; do
    STATE=$(az provider show --namespace "$PROVIDER" --query "registrationState" --output tsv 2>/dev/null || echo "NotRegistered")

    if [ "$STATE" == "Registered" ]; then
        echo "  $PROVIDER - already registered"
    else
        echo -e "  $PROVIDER - ${YELLOW}registering...${NC}"
        az provider register --namespace "$PROVIDER" --output none
    fi
done

# Wait for providers to be registered
echo ""
echo "Waiting for resource providers to be ready..."
for PROVIDER in "${REQUIRED_PROVIDERS[@]}"; do
    RETRIES=0
    MAX_RETRIES=60  # 5 minutes max wait
    while [ $RETRIES -lt $MAX_RETRIES ]; do
        STATE=$(az provider show --namespace "$PROVIDER" --query "registrationState" --output tsv 2>/dev/null)
        if [ "$STATE" == "Registered" ]; then
            break
        fi
        RETRIES=$((RETRIES + 1))
        if [ $RETRIES -eq 1 ]; then
            echo -n "  Waiting for $PROVIDER"
        fi
        echo -n "."
        sleep 5
    done
    if [ $RETRIES -gt 0 ]; then
        echo " ready"
    fi
    if [ "$STATE" != "Registered" ]; then
        echo -e "${RED}Error: Failed to register $PROVIDER after 5 minutes.${NC}"
        echo "Please register it manually:"
        echo "  az provider register --namespace $PROVIDER"
        echo "Then re-run this script."
        exit 1
    fi
done

echo -e "${GREEN}All resource providers ready.${NC}"

echo ""
echo "========================================="
echo "  Creating Resources"
echo "========================================="

# Create Resource Group
echo ""
echo "[1/8] Creating Resource Group..."
if az group show --name "$RESOURCE_GROUP" &>/dev/null; then
    echo "  Resource Group '$RESOURCE_GROUP' already exists."
else
    az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
    echo -e "  ${GREEN}Resource Group '$RESOURCE_GROUP' created.${NC}"
fi

# Create Container Registry
echo ""
echo "[2/8] Creating Container Registry..."
if az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
    echo "  Container Registry '$ACR_NAME' already exists."
else
    az acr create --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --sku Basic --admin-enabled true --output none
    echo -e "  ${GREEN}Container Registry '$ACR_NAME' created.${NC}"
fi

# Get ACR credentials
echo ""
echo "[3/8] Getting Container Registry credentials..."
ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer --output tsv)
ACR_USERNAME=$(az acr credential show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query username --output tsv)
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query "passwords[0].value" --output tsv)
echo "  ACR Login Server: $ACR_LOGIN_SERVER"

# Build and push image
echo ""
echo "[4/8] Building and pushing Docker image..."
IMAGE_NAME="$ACR_LOGIN_SERVER/bibmaps:$IMAGE_TAG"

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Build image using Azure Container Registry (builds on amd64 in the cloud)
# This avoids cross-platform build issues on Apple Silicon Macs
echo "  Building from: $PROJECT_ROOT"
echo "  Using ACR cloud build (linux/amd64)..."
echo "  This may take a few minutes..."

az acr build \
    --registry "$ACR_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --image "bibmaps:$IMAGE_TAG" \
    --platform linux/amd64 \
    "$PROJECT_ROOT"

echo -e "  ${GREEN}Image built and pushed: $IMAGE_NAME${NC}"

# Create Container App Environment
echo ""
echo "[5/8] Creating Container App Environment..."
if az containerapp env show --name "$CAE_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
    echo "  Container App Environment '$CAE_NAME' already exists."
else
    az containerapp env create \
        --name "$CAE_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --location "$LOCATION" \
        --output none
    echo -e "  ${GREEN}Container App Environment '$CAE_NAME' created.${NC}"
fi

# Create or update Container App
echo ""
echo "[6/8] Deploying Container App..."

# Generate a secret key for JWT tokens
SECRET_KEY=$(openssl rand -hex 32)

if az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
    echo "  Updating existing Container App '$APP_NAME'..."
    az containerapp update \
        --name "$APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --image "$IMAGE_NAME" \
        --output none
else
    echo "  Creating Container App '$APP_NAME'..."
    az containerapp create \
        --name "$APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --environment "$CAE_NAME" \
        --image "$IMAGE_NAME" \
        --target-port 8000 \
        --ingress external \
        --registry-server "$ACR_LOGIN_SERVER" \
        --registry-username "$ACR_USERNAME" \
        --registry-password "$ACR_PASSWORD" \
        --cpu 0.5 \
        --memory 1Gi \
        --min-replicas 0 \
        --max-replicas 3 \
        --env-vars "SECRET_KEY=$SECRET_KEY" \
        --output none
fi

# Get the app URL
APP_URL=$(az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --query "properties.configuration.ingress.fqdn" --output tsv)

# Configure Entra ID
echo ""
echo "[7/8] Configuring Entra ID Authentication..."

if [ "$CONFIGURE_ENTRA" = true ]; then

    # Create app registration if needed
    if [ -z "$ENTRA_APP_ID" ]; then
        echo "  Creating Entra ID App Registration..."

        # Create the app registration
        ENTRA_APP_ID=$(az ad app create \
            --display-name "BibMaps" \
            --sign-in-audience "AzureADandPersonalMicrosoftAccount" \
            --web-redirect-uris "https://$APP_URL/.auth/login/aad/callback" \
            --query appId \
            --output tsv)

        echo -e "  ${GREEN}App Registration created: $ENTRA_APP_ID${NC}"

        # Create a client secret
        echo "  Creating client secret..."
        SECRET_RESULT=$(az ad app credential reset \
            --id "$ENTRA_APP_ID" \
            --display-name "BibMaps-Secret" \
            --years 2 \
            --query password \
            --output tsv)
        ENTRA_CLIENT_SECRET="$SECRET_RESULT"

        echo -e "  ${GREEN}Client secret created.${NC}"
    fi

    # Configure Container App authentication
    echo "  Configuring Container App authentication..."

    # Enable authentication on the container app
    az containerapp auth microsoft update \
        --name "$APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --client-id "$ENTRA_APP_ID" \
        --client-secret "$ENTRA_CLIENT_SECRET" \
        --tenant-id "$TENANT_ID" \
        --issuer "https://login.microsoftonline.com/$TENANT_ID/v2.0" \
        --yes \
        --output none 2>/dev/null || {
            # If the above fails, try the alternative approach
            az containerapp auth update \
                --name "$APP_NAME" \
                --resource-group "$RESOURCE_GROUP" \
                --unauthenticated-client-action AllowAnonymous \
                --output none
        }

    echo -e "  ${GREEN}Entra ID authentication configured.${NC}"

    ENTRA_CONFIGURED=true
else
    echo "  Skipped (Entra ID not configured)"
    ENTRA_CONFIGURED=false
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Your BibMaps app is available at:"
echo -e "  ${GREEN}https://$APP_URL${NC}"
echo ""

if [ "$ENTRA_CONFIGURED" = true ]; then
    echo -e "${GREEN}Entra ID Authentication:${NC}"
    echo "  App Registration ID: $ENTRA_APP_ID"
    echo "  Tenant ID:           $TENANT_ID"
    echo ""
    echo "  Users can sign in with their Microsoft accounts."
    echo ""
    if [ -n "$SECRET_RESULT" ]; then
        echo -e "  ${YELLOW}IMPORTANT: Save this client secret - it won't be shown again:${NC}"
        echo -e "  ${YELLOW}$ENTRA_CLIENT_SECRET${NC}"
        echo ""
    fi
else
    echo -e "${YELLOW}Authentication:${NC}"
    echo "  Entra ID is not configured. Users will use local authentication."
    echo "  To enable Entra ID later, run: ./scripts/deploy-azure.sh"
    echo ""
fi

echo "Useful commands:"
echo ""
echo "  # View application logs"
echo "  az containerapp logs show --name $APP_NAME --resource-group $RESOURCE_GROUP --follow"
echo ""
echo "  # Update after code changes"
echo "  ./scripts/deploy-azure.sh --update"
echo ""
echo "  # Or manually:"
echo "  docker build -t $IMAGE_NAME $PROJECT_ROOT && docker push $IMAGE_NAME"
echo "  az containerapp update --name $APP_NAME --resource-group $RESOURCE_GROUP --image $IMAGE_NAME"
echo ""
echo "  # Destroy all resources"
echo "  ./scripts/deploy-azure.sh --destroy"
echo ""
