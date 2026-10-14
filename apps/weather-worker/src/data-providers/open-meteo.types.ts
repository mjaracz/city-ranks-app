export interface WeatherCoordinates {
  latitude: number;
  longitude: number;
}

export interface CurrentWeather {
  source: {
    name: 'Open-Meteo';
    attributionUrl: 'https://open-meteo.com/';
    license: 'CC BY 4.0';
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/';
  };
  requestedCoordinates: WeatherCoordinates;
  gridCoordinates: WeatherCoordinates;
  observedAt: string;
  temperatureCelsius: number;
  relativeHumidityPercent: number;
  apparentTemperatureCelsius: number;
  precipitationMillimeters: number;
  weatherCode: number;
  windSpeedKilometersPerHour: number;
  windDirectionDegrees: number;
}
