# ProjectsApi

All URIs are relative to *https://davinci-app.com*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**downloadProjectFile**](ProjectsApi#downloadProjectFile) | **GET** /api/v2/programmatic/projects/{projectId}/files/{fileId} | Download a project file |
| [**getProject**](ProjectsApi#getProject) | **GET** /api/v2/programmatic/projects/{projectId} | Get project metadata and permissions |
| [**getProjectObject**](ProjectsApi#getProjectObject) | **GET** /api/v2/programmatic/projects/{projectId}/objects/{objectId} | Get a project object |
| [**getProjectTree**](ProjectsApi#getProjectTree) | **GET** /api/v2/programmatic/projects/{projectId}/tree | Get project tree |
| [**listProjectFiles**](ProjectsApi#listProjectFiles) | **GET** /api/v2/programmatic/projects/{projectId}/files | List files attached to a project |
| [**listProjects**](ProjectsApi#listProjects) | **GET** /api/v2/programmatic/projects | List accessible projects |


<a name="downloadProjectFile"></a>
# **downloadProjectFile**
> File downloadProjectFile(projectId, fileId, branch)

Download a project file

    Returns raw file bytes with content headers forwarded from Design Engine.

### Parameters

|Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **projectId** | **String**| Project id. May be compound in the form &#x60;{projectId}--{branchName}&#x60;. | [default to null] |
| **fileId** | **String**| Reference object id or storage filename. | [default to null] |
| **branch** | **String**|  | [optional] [default to main] |

### Return type

**File**

### Authorization

[ApiKeyBearer](/pages/api/reference#ApiKeyBearer)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/octet-stream, application/json

<a name="getProject"></a>
# **getProject**
> ProjectMetadataEnvelope getProject(projectId)

Get project metadata and permissions

    Returns 404 when the project does not exist or is hidden from the caller.

### Parameters

|Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **projectId** | **String**| Project id. May be compound in the form &#x60;{projectId}--{branchName}&#x60;. | [default to null] |

### Return type

[**ProjectMetadataEnvelope**](../Models/ProjectMetadataEnvelope)

### Authorization

[ApiKeyBearer](/pages/api/reference#ApiKeyBearer)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

<a name="getProjectObject"></a>
# **getProjectObject**
> ProjectObjectEnvelope getProjectObject(projectId, objectId, branch)

Get a project object

    Returns a full object payload. Object shape is type-specific; common fields are documented and extra fields are allowed.

### Parameters

|Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **projectId** | **String**| Project id. May be compound in the form &#x60;{projectId}--{branchName}&#x60;. | [default to null] |
| **objectId** | **String**|  | [default to null] |
| **branch** | **String**|  | [optional] [default to main] |

### Return type

[**ProjectObjectEnvelope**](../Models/ProjectObjectEnvelope)

### Authorization

[ApiKeyBearer](/pages/api/reference#ApiKeyBearer)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

<a name="getProjectTree"></a>
# **getProjectTree**
> ProjectTreeEnvelope getProjectTree(projectId, branch)

Get project tree

    Auto-acquires a Design Engine instance, then returns a flat tree of project objects.

### Parameters

|Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **projectId** | **String**| Project id. May be compound in the form &#x60;{projectId}--{branchName}&#x60;. | [default to null] |
| **branch** | **String**|  | [optional] [default to main] |

### Return type

[**ProjectTreeEnvelope**](../Models/ProjectTreeEnvelope)

### Authorization

[ApiKeyBearer](/pages/api/reference#ApiKeyBearer)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

<a name="listProjectFiles"></a>
# **listProjectFiles**
> ListFilesEnvelope listProjectFiles(projectId, branch)

List files attached to a project

    Files are derived from project reference objects.

### Parameters

|Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **projectId** | **String**| Project id. May be compound in the form &#x60;{projectId}--{branchName}&#x60;. | [default to null] |
| **branch** | **String**|  | [optional] [default to main] |

### Return type

[**ListFilesEnvelope**](../Models/ListFilesEnvelope)

### Authorization

[ApiKeyBearer](/pages/api/reference#ApiKeyBearer)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

<a name="listProjects"></a>
# **listProjects**
> ListProjectsEnvelope listProjects(page, limit)

List accessible projects

    Returns a flat paginated list of projects visible to the authenticated API-key actor.

### Parameters

|Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **page** | **Integer**|  | [optional] [default to 1] |
| **limit** | **Integer**|  | [optional] [default to 50] |

### Return type

[**ListProjectsEnvelope**](../Models/ListProjectsEnvelope)

### Authorization

[ApiKeyBearer](/pages/api/reference#ApiKeyBearer)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

