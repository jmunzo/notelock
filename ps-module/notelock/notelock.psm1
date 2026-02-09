#################################
# NOTELOCK PS MODULE
# 
# by github.com/jmunzo
#
# WARNING!  READ THIS FIRST!
# Notelock REQUIRES PowerShell 7 to encrypt data using AES-GCM.
# Please make sure that you have PowerShell 7 installed.
# As long as PowerShell 7 is installed, you can execute this
# command from inside a PowerShell 5 environment.
#
# If running in PS5, this script will run encryptions in a 
# separate PS7 window, then continue back in the PS5 environment.
#################################

# BASIC USAGE:
# Locally encrypt and post a message to a Notelock instance -
# New-NotelockMessage -Server "my.domain.com" -Message "Hello World!"
#
# Locally encrypt and post a message to a Notelock instance using a Self-Signed certificate (for testing) -
# New-NotelockMessage -Server "my.domain.com" -Message "Hello World!" -SelfSigned $true


#################################
# Notelock - New Message
#################################
function New-NotelockMessage {
    param (
        [Parameter(Mandatory=$true)]
        [string]$Server, # the FQDN of the server to connect to (i.e. my.domain.com)
        [Parameter(Mandatory=$true)]
        [string]$Message, # the PlainText message to encrypt
        [bool]$SelfSigned=$false, # whether we allow Self-Signed SSL certs or not (FOR SERVER TESTING ONLY)
        [bool]$LegacySupport=$false # whether we are supporting a PowerShell 5 request
    )

    # Check if this is a loopback from inside PowerShell5
    if ($LegacySupport) {
        Invoke-NotelockEncryptMessagePS5 -Message $Message
    } else {
        # Allow Self-Signed SSL certs, if we aren't executing directly from PowerShell7
        if (($PSVersionTable.PSVersion.Major -lt 7) -and $SelfSigned) {
            New-NotelockSSLHandler
        }

        # Test connection to the Server
        if ($(Test-NetConnection $Server -Port 443).TcpTestSucceeded) {
        } else {
            Write-Error -Message "Could not contact server"
            return
        }

        # Ensure message isn't blank
        if ($Message -ne '') {
            # Get the encrypted message
            $encMsg = Invoke-NotelockEncryptMessage -Message $Message
        } else {
            Write-Error -Message "Message is empty"
            return
        }

        # Join the IV and CipherText and escape
        $joinedMsg = $encMsg.InitVector + $encMsg.CipherTag
        $joinedMsg = $joinedMsg.Replace("+", "%2B") # Escape characters because PowerShell is terrible

        # Construct the POST method
        $headers = New-Object "System.Collections.Generic.Dictionary[[String],[String]]"
        $headers.Add("Content-Type", "application/x-www-form-urlencoded")
        $body = "cipher=$joinedMsg"
        
        # If we are allowing Self-Signed SSL certs
        if ($SelfSigned) {
            # POST - PowerShell 5
            if ($PSVersionTable.PSVersion.Major -lt 7) {
                # Temporarily disable checks using the new class
                [System.Net.ServicePointManager]::ServerCertificateValidationCallback = [SSLHandler]::GetSSLHandler()
                try
                {
                    # POST
                    $response = Invoke-RestMethod -Uri "https://$server/encrypt" -Method "POST" -Headers $headers -Body $body
                } catch {
                    # Do nothing
                } finally {
                    # Enable checks again
                    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $null
                }
            } else {
                # POST - PowerShell 7
                $response = Invoke-RestMethod -Uri "https://$server/encrypt" -Method "POST" -Headers $headers -Body $body -SkipCertificateCheck
            }
        } else {
            # POST - Universal for proper SSL certs
            $response = Invoke-RestMethod -Uri "https://$server/encrypt" -Method "POST" -Headers $headers -Body $body
        }

        # Convert our Secret Key to an URL-safe equivalent
        $urlSafeB64Key = $($encMsg.Key).Replace('+', '-').Replace('/', '_').Replace('=', '')

        # Form our private URL and return
        $privURL = $response.id + $urlSafeB64Key
        return $privUrl
    }
}

function Invoke-NotelockAesGcmEncrypt {
        param (
            [Parameter(Mandatory=$true)]
            [string]$Message # the PlainText message to encrypt
        )

        # Generate a Secret Key
        $key = [byte[]]::new(32) # 256-bit
        [System.Security.Cryptography.RandomNumberGenerator]::Fill($key)
        $aesGcm = [Security.Cryptography.AesGcm]::new($key)

        # Generate an Initialization Vector
        $IV = [byte[]]::new(12) # PS only does 96-bit...
        [System.Security.Cryptography.RandomNumberGenerator]::Fill($IV)

        # Set tag length
        $tag = [byte[]]::new(16) # 128-bit

        # Convert the Message to an ArrayBuffer
        $plainBytes = [System.Text.Encoding]::UTF8.GetBytes($Message)

        # Encrypt
        $cipherText = [byte[]]::new($plainBytes.Length)
        $aesGcm.Encrypt($IV, $plainBytes, $cipherText, $tag, $null)

        # Join Cipher + Tag (Web Crypto API method)
        $cipherTag = $cipherText + $tag

        # Return the object
        return [PSCustomObject]@{
            InitVector = $([System.Convert]::ToBase64String($IV))
            Key = $([System.Convert]::ToBase64String($key))
            CipherTag = $([System.Convert]::ToBase64String($cipherTag))
            CipherText = $([System.Convert]::ToBase64String($cipherText))
            Tag = $([System.Convert]::ToBase64String($tag))
        }
}


#################################
# Notelock - Encrypt Message
#################################

function Invoke-NotelockEncryptMessage {
    param (
        [Parameter(Mandatory=$true)]
        [string]$Message # the PlainText message to encrypt
    )

    # Check if PS7 is installed
    if (Test-Path "$Env:ProgramFiles\powershell\7\pwsh.exe") {
    } else {
        Write-Error "Requires PowerShell 7 to be installed."
        return
    }

    # If PS7 is installed, and we aren't in PS7, run the script in a new PS7 window
    if ($PSVersionTable.PSVersion.Major -lt 7) {
        $tempFile = [System.IO.Path]::GetTempFileName() # temp file to receive PS7 output in PS5
        $escapedMsg = [Regex]::Escape($Message) # Escape the message content
        $escapedMsg = $escapedMsg.Replace("'","''") # Escape single quotes as well
        # Run the process in a new PS7 environment
        Start-Process -FilePath "$Env:ProgramFiles\powershell\7\pwsh.exe" -ArgumentList "-Command `"New-NotelockMessage -Server empty -LegacySupport `$true -Message `'$escapedMsg`'`"" -Wait -WindowStyle Hidden -RedirectStandardOutput $tempFile
        $output = Get-Content -Path $tempFile
        # Return data
        return [PSCustomObject]@{
            InitVector = $output[0]
            Key = $output[1]
            CipherTag = $output[2]
            CipherText = $output[3]
            Tag = $output[4]
        }
        # Remove temp file
        Remove-Item -Path $tempFile
    } else {
        # Encrypt and return
        return Invoke-NotelockAesGcmEncrypt -Message $Message
    }
}


#################################
# Notelock - PowerShell5 Support
#################################

function Invoke-NotelockEncryptMessagePS5 {
    param (
        [Parameter(Mandatory=$true)]
        [string]$Message # the PlainText message to encrypt
    )

    # Make PSCustomObjects render with PS5 compatibility
    $PSStyle.OutputRendering = [System.Management.Automation.OutputRendering]::PlainText

    # Unescape the message contents
    $unescapedMsg = [Regex]::Unescape($Message) # Escape the message content
    $unescapedMsg = $unescapedMsg.Replace("''","'") # Unescape single quotes as well

    # Encrypt the message
    $encData = Invoke-NotelockAesGcmEncrypt -Message $unescapedMsg

    # Write to output file
    Write-Host $encData.InitVector
    Write-Host $encData.Key
    Write-Host $encData.CipherTag
    Write-Host $encData.CipherText
    Write-Host $encData.Tag
}

#################################
# Notelock - SSL Handler
#################################

function New-NotelockSSLHandler {

# Create a C# class to handle the callback
#############################################################################################################################
$code = @"
public class SSLHandler
{
    public static System.Net.Security.RemoteCertificateValidationCallback GetSSLHandler()
    {

        return new System.Net.Security.RemoteCertificateValidationCallback((sender, certificate, chain, policyErrors) => { return true; });
    }
    
}
"@
#############################################################################################################################

    # Compile the class
    Add-Type -TypeDefinition $code

}


# Export
Export-ModuleMember -Function New-NotelockMessage