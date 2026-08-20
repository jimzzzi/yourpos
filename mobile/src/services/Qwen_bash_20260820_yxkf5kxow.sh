# 1. Create the main solution
dotnet new sln -n OnePlusERP

# 2. Create the Clean Architecture projects
dotnet new classlib -n OnePlus.Core
dotnet new classlib -n OnePlus.Infrastructure
dotnet new wpf -n OnePlus.DesktopUI

# 3. Add all projects to the solution
dotnet sln add OnePlus.Core/OnePlus.Core.csproj
dotnet sln add OnePlus.Infrastructure/OnePlus.Infrastructure.csproj
dotnet sln add OnePlus.DesktopUI/OnePlus.DesktopUI.csproj

# 4. Set up Project References (The Dependency Chain)
# Infrastructure depends on Core
dotnet add OnePlus.Infrastructure/OnePlus.Infrastructure.csproj reference OnePlus.Core/OnePlus.Core.csproj
# DesktopUI depends on Infrastructure (and indirectly Core)
dotnet add OnePlus.DesktopUI/OnePlus.DesktopUI.csproj reference OnePlus.Infrastructure/OnePlus.Infrastructure.csproj