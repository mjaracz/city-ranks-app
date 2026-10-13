# Open-Meteo provider

`WeatherWorkerModule` registers `OpenMeteoProvider` as a local Nest dependency.
Inject it into weather application services and call
`getCurrentWeather({ latitude, longitude })` for current conditions.

The provider owns its configuration and method parameters. Its models are scoped
to the class through type-only declaration merging:
`OpenMeteoProvider.Coordinates`, `OpenMeteoProvider.CurrentWeather`, and
`OpenMeteoProvider.Configuration`.

`OPEN_METEO_FORECAST_API_URL` defaults to
`https://api.open-meteo.com/v1/forecast`. The free endpoint is for non-commercial
use; configure the customer endpoint and `OPEN_METEO_API_KEY` for commercial use.
Only weather-worker reads these settings.

The provider returns UTC timestamps, explicit units, requested and grid
coordinates, and attribution and license metadata for downstream consumers.
Weather data is licensed under CC BY 4.0.
