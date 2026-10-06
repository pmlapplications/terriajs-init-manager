-- Terria catalog member types, from
-- https://docs.terria.io/guide/connecting-to-data/ (groups, items, references, functions).
-- Add rows here as Terria introduces new types.

set search_path = terria, public;

insert into catalog_type (type, kind, model_name, docs_url) values
  -- Groups
  ('group',                    'group', 'CatalogGroup',                      'https://docs.terria.io/guide/connecting-to-data/catalog-type-details/group/'),
  ('esri-group',               'group', 'ArcGisCatalogGroup',                null),
  ('esri-featureServer-group', 'group', 'ArcGisFeatureServerCatalogGroup',   null),
  ('esri-mapServer-group',     'group', 'ArcGisMapServerCatalogGroup',       null),
  ('arcgis-portal-group',      'group', 'ArcGisPortalCatalogGroup',          null),
  ('ckan-group',               'group', 'CkanCatalogGroup',                  null),
  ('csw-group',                'group', 'CswCatalogGroup',                   null),
  ('opendatasoft-group',       'group', 'OpenDataSoftCatalogGroup',          null),
  ('sdmx-group',               'group', 'SdmxCatalogGroup',                  null),
  ('socrata-group',            'group', 'SocrataCatalogGroup',               null),
  ('thredds-group',            'group', 'ThreddsCatalogGroup',               null),
  ('wfs-group',                'group', 'WebFeatureServiceCatalogGroup',     null),
  ('wms-group',                'group', 'WebMapServiceCatalogGroup',         null),
  ('wmts-group',               'group', 'WebMapTileServiceCatalogGroup',     null),
  ('wps-getCapabilities',      'group', 'WebProcessingServiceCatalogGroup',  null),

  -- Items
  ('api-table',            'item', 'ApiTableCatalogItem',                 null),
  ('esri-featureServer',   'item', 'ArcGisFeatureServerCatalogItem',      null),
  ('esri-imageServer',     'item', 'ArcGisImageServerCatalogItem',        null),
  ('esri-mapServer',       'item', 'ArcGisMapServerCatalogItem',          null),
  ('arcgis-terrain',       'item', 'ArcGisTerrainCatalogItem',            null),
  ('assimp',               'item', 'AssImpCatalogItem',                   null),
  ('bing-maps',            'item', 'BingMapsCatalogItem',                 null),
  ('carto',                'item', 'CartoMapV1CatalogItem',               null),
  ('carto-v3',             'item', 'CartoMapV3CatalogItem',               null),
  ('3d-tiles',             'item', 'Cesium3DTilesCatalogItem',            null),
  ('cesium-terrain',       'item', 'CesiumTerrainCatalogItem',            null),
  ('cog',                  'item', 'CogCatalogItem',                      null),
  ('composite',            'item', 'CompositeCatalogItem',                null),
  ('csv',                  'item', 'CsvCatalogItem',                      null),
  ('czml',                 'item', 'CzmlCatalogItem',                     null),
  ('geojson',              'item', 'GeoJsonCatalogItem',                  null),
  ('georss',               'item', 'GeoRssCatalogItem',                   null),
  ('gltf',                 'item', 'GltfCatalogItem',                     null),
  ('gpx',                  'item', 'GpxCatalogItem',                      null),
  ('gtfs',                 'item', 'GtfsCatalogItem',                     null),
  ('i3s',                  'item', 'I3SCatalogItem',                      null),
  ('ion-imagery',          'item', 'IonImageryCatalogItem',               null),
  ('kml',                  'item', 'KmlCatalogItem',                      null),
  ('mapbox-map',           'item', 'MapboxMapCatalogItem',                null),
  ('mapbox-style',         'item', 'MapboxStyleCatalogItem',              null),
  ('mvt',                  'item', 'MapboxVectorTileCatalogItem',         null),
  ('opendatasoft-item',    'item', 'OpenDataSoftCatalogItem',             null),
  ('open-street-map',      'item', 'OpenStreetMapCatalogItem',            null),
  ('sdmx-json',            'item', 'SdmxJsonCatalogItem',                 null),
  ('senaps-locations',     'item', 'SenapsLocationsCatalogItem',          null),
  ('sos',                  'item', 'SensorObservationServiceCatalogItem', null),
  ('shp',                  'item', 'ShapefileCatalogItem',                null),
  ('socrata-map-item',     'item', 'SocrataMapViewCatalogItem',           null),
  ('stub',                 'item', 'StubCatalogItem',                     null),
  ('tms',                  'item', 'TileMapServiceCatalogItem',           null),
  ('url-template-imagery', 'item', 'UrlTemplateImageryCatalogItem',       null),
  ('wfs',                  'item', 'WebFeatureServiceCatalogItem',        null),
  ('wms',                  'item', 'WebMapServiceCatalogItem',            null),
  ('wmts',                 'item', 'WebMapTileServiceCatalogItem',        null),

  -- References
  ('arcgis-portal-item',      'reference', 'ArcGisPortalItemReference', null),
  ('catalog-index-reference', 'reference', 'CatalogIndexReference',     null),
  ('ckan-item',               'reference', 'CkanItemReference',         null),
  ('split-reference',         'reference', 'SplitItemReference',        null),
  ('terria-reference',        'reference', 'TerriaReference',           null),
  ('url-reference',           'reference', 'UrlReference',              null),

  -- Functions
  ('wps',  'function', 'WebProcessingServiceCatalogFunction', null),
  ('ydyr', 'function', 'YDYRCatalogFunction',                 null);

update catalog_type
set docs_url = 'https://docs.terria.io/guide/connecting-to-data/catalog-type-details/' || type || '/'
where docs_url is null;
