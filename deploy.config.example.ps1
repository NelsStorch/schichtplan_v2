# Vorlage fuer deploy.config.ps1 (gitignored): Serverdetails gehoeren nicht ins Repo.
#   Copy-Item deploy.config.example.ps1 deploy.config.ps1
$Server = "root@<server-ip>"
$RemoteBase = "/home/<benutzer>/projects"
# Optional: Discord-Webhook fuer Deploy-Benachrichtigungen
$DiscordWebhookUrl = ""
