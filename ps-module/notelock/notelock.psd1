@{

    # Script module or binary module file associated with this manifest.
    RootModule = 'notelock'
    
    # Version number of this module.
    ModuleVersion = '1.0'
    
    # ID used to uniquely identify this module
    GUID = '0b4793ae-5cb0-464e-8464-2549db0986c5'
    
    # Author of this module
    Author = 'jmunzo'
    
    # Company or vendor of this module
    CompanyName = ''
    
    # Copyright statement for this module
    Copyright = '(c) jmunzo. All rights reserved.'
    
    # Functions to export from this module, for best performance, do not use wildcards and do not delete the entry, use an empty array if there are no functions to export.
    FunctionsToExport = @("New-NotelockMessage")
    
    # Cmdlets to export from this module, for best performance, do not use wildcards and do not delete the entry, use an empty array if there are no cmdlets to export.
    CmdletsToExport = @()
    
    # Variables to export from this module
    VariablesToExport = '*'
    
    # Aliases to export from this module, for best performance, do not use wildcards and do not delete the entry, use an empty array if there are no aliases to export.
    AliasesToExport = @()
    
    # Private data to pass to the module specified in RootModule/ModuleToProcess. This may also contain a PSData hashtable with additional module metadata used by PowerShell.
    PrivateData = @{
    
        PSData = @{
    
        } # End of PSData hashtable
    
    } # End of PrivateData hashtable
    
}