# MetaApi

All URIs are relative to *https://davinci-app.com*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getApiInfo**](MetaApi#getApiInfo) | **GET** /api/v2/programmatic | Get programmatic API metadata |
| [**getHealth**](MetaApi#getHealth) | **GET** /api/v2/programmatic/health | Check programmatic API health |


<a name="getApiInfo"></a>
# **getApiInfo**
> ProgrammaticApiInfoEnvelope getApiInfo()

Get programmatic API metadata

    Returns the current public programmatic API name, version, endpoint map, and authentication hint.

### Parameters
This endpoint does not need any parameter.

### Return type

[**ProgrammaticApiInfoEnvelope**](../Models/ProgrammaticApiInfoEnvelope)

### Authorization

[ApiKeyBearer](/pages/api/reference#ApiKeyBearer)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

<a name="getHealth"></a>
# **getHealth**
> ProgrammaticHealthEnvelope getHealth()

Check programmatic API health

    Returns a lightweight health payload for the public programmatic API.

### Parameters
This endpoint does not need any parameter.

### Return type

[**ProgrammaticHealthEnvelope**](../Models/ProgrammaticHealthEnvelope)

### Authorization

[ApiKeyBearer](/pages/api/reference#ApiKeyBearer)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: application/json

