import { Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { type GeoMapAddressFields } from 'src/engine/core-modules/geo-map/types/geo-map-address-fields.type';
import { type GeoMapAutocompleteSanitizedResult } from 'src/engine/core-modules/geo-map/types/geo-map-autocomplete-sanitized-result.type';
import { sanitizeAutocompleteResults } from 'src/engine/core-modules/geo-map/utils/sanitize-autocomplete-results.util';
import { sanitizePlaceDetailsResults } from 'src/engine/core-modules/geo-map/utils/sanitize-place-details-results.util';
import { SecureHttpClientService } from 'src/engine/core-modules/secure-http-client/secure-http-client.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

@Injectable()
export class GeoMapService {
  constructor(
    private readonly twentyConfigService: TwentyConfigService,
    private readonly secureHttpClientService: SecureHttpClientService,
  ) {}

  // OMNIA-CUSTOM: read flag + key per-request instead of in the constructor.
  // DatabaseConfigDriver loads its cache in `async onModuleInit` which runs
  // AFTER provider constructors, so caching the key at construction time
  // returns `undefined` on DB-only deploys and every Google Places call
  // produces `?key=undefined` → REQUEST_DENIED → empty results.
  private getApiMapKey(): string | undefined {
    if (
      !this.twentyConfigService.get('IS_MAPS_AND_ADDRESS_AUTOCOMPLETE_ENABLED')
    ) {
      return undefined;
    }

    return this.twentyConfigService.get('GOOGLE_MAP_API_KEY') || undefined;
  }

  public async getAutoCompleteAddress(
    address: string,
    token: string,
    country?: string,
    isFieldCity?: boolean,
  ): Promise<GeoMapAutocompleteSanitizedResult[] | undefined> {
    if (!isNonEmptyString(address?.trim())) {
      return [];
    }

    const apiMapKey = this.getApiMapKey();

    if (!isNonEmptyString(apiMapKey)) {
      return [];
    }

    let url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(address)}&sessiontoken=${token}&key=${apiMapKey}`;

    if (isNonEmptyString(country)) {
      url += `&components=country:${country}`;
    }
    if (isDefined(isFieldCity) && isFieldCity === true) {
      url += `&types=(cities)`;
    }
    const httpClient = this.secureHttpClientService.getHttpClient();

    const result = await httpClient.get(url);

    if (result.data.status === 'OK') {
      return sanitizeAutocompleteResults(result.data.predictions);
    }

    return [];
  }

  public async getAddressDetails(
    placeId: string,
    token: string,
  ): Promise<GeoMapAddressFields | undefined> {
    const apiMapKey = this.getApiMapKey();

    if (!isNonEmptyString(apiMapKey)) {
      return {};
    }

    const httpClient = this.secureHttpClientService.getHttpClient();

    const result = await httpClient.get(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&sessiontoken=${token}&fields=address_components%2Cgeometry&key=${apiMapKey}`,
    );

    if (result.data.status === 'OK') {
      return sanitizePlaceDetailsResults({
        addressComponents: result.data.result?.address_components,
        location: result.data.result?.geometry?.location,
      });
    }

    return {};
  }
}
