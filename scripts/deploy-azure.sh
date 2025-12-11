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
DEFAULT_SQL_SERVER_SUFFIX="sql"
DEFAULT_SQL_DB_NAME="bibmapsdb"

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

# Database Configuration (only for new deployments or if not in update mode)
DATABASE_TYPE="ephemeral"
SQL_SERVER_NAME=""
SQL_DB_NAME=""
SQL_ADMIN_USER=""
SQL_ADMIN_PASSWORD=""
DATABASE_URL=""

if [ "$UPDATE_MODE" = false ] && [ "$DRY_RUN" = false ]; then
    echo ""
    echo "========================================="
    echo "  Database Configuration"
    echo "========================================="
    echo ""
    echo "Choose how to store your data:"
    echo ""
    echo "  1) Ephemeral SQLite (default)"
    echo "     - Free, no additional resources"
    echo "     - Data is lost when container restarts"
    echo "     - Good for demos and testing"
    echo ""
    echo "  2) Azure SQL Database"
    echo "     - Persistent, managed database"
    echo "     - ~\$5-15/month (Basic tier)"
    echo "     - Recommended for production"
    echo ""
    read -p "Select database option [1-2, default=1]: " DB_CHOICE

    case "$DB_CHOICE" in
        2)
            DATABASE_TYPE="azure-sql"
            echo ""
            echo -e "${BLUE}Azure SQL Database selected.${NC}"

            # Generate server name based on app name
            SQL_SERVER_NAME="${APP_NAME}-${DEFAULT_SQL_SERVER_SUFFIX}"
            SQL_DB_NAME="$DEFAULT_SQL_DB_NAME"

            read -p "SQL Server name [$SQL_SERVER_NAME]: " INPUT_SQL_SERVER
            SQL_SERVER_NAME=${INPUT_SQL_SERVER:-$SQL_SERVER_NAME}

            read -p "Database name [$SQL_DB_NAME]: " INPUT_SQL_DB
            SQL_DB_NAME=${INPUT_SQL_DB:-$SQL_DB_NAME}

            # Check if SQL server already exists
            if az sql server show --name "$SQL_SERVER_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null 2>&1; then
                echo -e "${BLUE}SQL Server '$SQL_SERVER_NAME' already exists.${NC}"
                read -p "SQL admin username: " SQL_ADMIN_USER
                read -s -p "SQL admin password: " SQL_ADMIN_PASSWORD
                echo ""
            else
                echo ""
                echo "Setting up new SQL Server credentials..."
                read -p "SQL admin username [bibmapsadmin]: " SQL_ADMIN_USER
                SQL_ADMIN_USER=${SQL_ADMIN_USER:-bibmapsadmin}

                # Generate a secure password if not provided
                echo "Enter a password or press Enter to generate one."
                echo "(Must be 8+ chars with uppercase, lowercase, number, and special char)"
                read -s -p "SQL admin password: " SQL_ADMIN_PASSWORD
                echo ""

                if [ -z "$SQL_ADMIN_PASSWORD" ]; then
                    SQL_ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -dc 'A-Za-z0-9' | head -c 12)
                    SQL_ADMIN_PASSWORD="${SQL_ADMIN_PASSWORD}Aa1!"
                    echo -e "${YELLOW}Generated password: $SQL_ADMIN_PASSWORD${NC}"
                    echo -e "${YELLOW}Please save this password!${NC}"
                fi
            fi
            ;;
        *)
            DATABASE_TYPE="ephemeral"
            echo ""
            echo -e "${YELLOW}Ephemeral SQLite selected. Data will not persist across restarts.${NC}"
            ;;
    esac
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
if [ "$DATABASE_TYPE" = "azure-sql" ]; then
    echo -e "Database:                  ${GREEN}Azure SQL Database${NC}"
    echo "  SQL Server:              $SQL_SERVER_NAME"
    echo "  Database:                $SQL_DB_NAME"
    echo "  Admin User:              $SQL_ADMIN_USER"
else
    echo -e "Database:                  ${YELLOW}Ephemeral SQLite (data not persisted)${NC}"
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
        echo "  [8/8] Production environment - WOULD SET AZURE_EASY_AUTH_ENABLED=true"
    else
        echo "  [7/8] Entra ID - Skipped (not configured)"
        echo "  [8/8] Production environment - Skipped (Entra ID not configured)"
    fi

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

# Add SQL provider if Azure SQL is selected
if [ "$DATABASE_TYPE" = "azure-sql" ]; then
    REQUIRED_PROVIDERS+=("Microsoft.Sql")
fi

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
echo "[1/9] Creating Resource Group..."
if az group show --name "$RESOURCE_GROUP" &>/dev/null; then
    echo "  Resource Group '$RESOURCE_GROUP' already exists."
else
    az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
    echo -e "  ${GREEN}Resource Group '$RESOURCE_GROUP' created.${NC}"
fi

# Create Container Registry
echo ""
echo "[2/9] Creating Container Registry..."
if az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
    echo "  Container Registry '$ACR_NAME' already exists."
else
    az acr create --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --sku Basic --admin-enabled true --output none
    echo -e "  ${GREEN}Container Registry '$ACR_NAME' created.${NC}"
fi

# Get ACR credentials
echo ""
echo "[3/9] Getting Container Registry credentials..."
ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer --output tsv)
ACR_USERNAME=$(az acr credential show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query username --output tsv)
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query "passwords[0].value" --output tsv)
echo "  ACR Login Server: $ACR_LOGIN_SERVER"

# Build and push image
echo ""
echo "[4/9] Building and pushing Docker image..."
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
echo "[5/9] Creating Container App Environment..."
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

# Create Azure SQL Database if selected
echo ""
echo "[6/9] Configuring Database..."
if [ "$DATABASE_TYPE" = "azure-sql" ]; then
    echo "  Setting up Azure SQL Database..."

    # Create SQL Server if it doesn't exist
    if az sql server show --name "$SQL_SERVER_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null 2>&1; then
        echo "  SQL Server '$SQL_SERVER_NAME' already exists."
    else
        echo "  Creating SQL Server '$SQL_SERVER_NAME'..."
        az sql server create \
            --name "$SQL_SERVER_NAME" \
            --resource-group "$RESOURCE_GROUP" \
            --location "$LOCATION" \
            --admin-user "$SQL_ADMIN_USER" \
            --admin-password "$SQL_ADMIN_PASSWORD" \
            --output none
        echo -e "  ${GREEN}SQL Server created.${NC}"
    fi

    # Create database if it doesn't exist
    if az sql db show --name "$SQL_DB_NAME" --server "$SQL_SERVER_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null 2>&1; then
        echo "  Database '$SQL_DB_NAME' already exists."
    else
        echo "  Creating database '$SQL_DB_NAME' (Basic tier)..."
        az sql db create \
            --resource-group "$RESOURCE_GROUP" \
            --server "$SQL_SERVER_NAME" \
            --name "$SQL_DB_NAME" \
            --edition Basic \
            --capacity 5 \
            --max-size 2GB \
            --output none
        echo -e "  ${GREEN}Database created.${NC}"
    fi

    # Configure firewall to allow Azure services
    echo "  Configuring firewall rules..."
    az sql server firewall-rule create \
        --resource-group "$RESOURCE_GROUP" \
        --server "$SQL_SERVER_NAME" \
        --name "AllowAzureServices" \
        --start-ip-address 0.0.0.0 \
        --end-ip-address 0.0.0.0 \
        --output none 2>/dev/null || true
    echo -e "  ${GREEN}Firewall configured.${NC}"

    # Build the connection string
    SQL_SERVER_FQDN="${SQL_SERVER_NAME}.database.windows.net"
    # URL-encode the password
    ENCODED_PASSWORD=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$SQL_ADMIN_PASSWORD', safe=''))")
    DATABASE_URL="mssql+pyodbc://${SQL_ADMIN_USER}:${ENCODED_PASSWORD}@${SQL_SERVER_FQDN}/${SQL_DB_NAME}?driver=ODBC+Driver+18+for+SQL+Server&Encrypt=yes&TrustServerCertificate=no"

    echo -e "  ${GREEN}Azure SQL Database configured.${NC}"
else
    echo "  Using ephemeral SQLite (data will not persist across restarts)"
fi

# Create or update Container App
echo ""
echo "[7/9] Deploying Container App..."

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

    # Build environment variables
    ENV_VARS="SECRET_KEY=$SECRET_KEY"
    if [ -n "$DATABASE_URL" ]; then
        ENV_VARS="$ENV_VARS DATABASE_URL=$DATABASE_URL"
    fi

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
        --env-vars $ENV_VARS \
        --output none
fi

# Get the app URL
APP_URL=$(az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --query "properties.configuration.ingress.fqdn" --output tsv)

# Configure Entra ID
echo ""
echo "[8/9] Configuring Entra ID Authentication..."

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

# Set AZURE_EASY_AUTH_ENABLED environment variable based on Entra ID configuration
echo ""
echo "[9/9] Configuring production environment..."
if [ "$ENTRA_CONFIGURED" = true ]; then
    echo "  Setting AZURE_EASY_AUTH_ENABLED=true for production security..."
    az containerapp update \
        --name "$APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --set-env-vars "AZURE_EASY_AUTH_ENABLED=true" \
        --output none
    echo -e "  ${GREEN}Production security enabled - authentication required for content creation.${NC}"
else
    echo "  AZURE_EASY_AUTH_ENABLED not set (Entra ID not configured)"
    echo "  Anonymous content creation will be allowed."
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Your BibMaps app is available at:"
echo -e "  ${GREEN}https://$APP_URL${NC}"
echo ""

# Database info
if [ "$DATABASE_TYPE" = "azure-sql" ]; then
    echo -e "${GREEN}Database:${NC}"
    echo "  Type:     Azure SQL Database"
    echo "  Server:   ${SQL_SERVER_NAME}.database.windows.net"
    echo "  Database: $SQL_DB_NAME"
    echo "  User:     $SQL_ADMIN_USER"
    echo ""
    echo -e "  ${YELLOW}IMPORTANT: Save your database credentials!${NC}"
    echo -e "  ${YELLOW}Password:  $SQL_ADMIN_PASSWORD${NC}"
else
    echo -e "${YELLOW}Database:${NC}"
    echo "  Type: Ephemeral SQLite"
    echo "  Data will be lost when the container restarts."
    echo "  To use persistent storage, re-deploy with Azure SQL option."
fi
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
