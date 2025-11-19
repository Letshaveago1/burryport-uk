import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type Forecast = {
  forecast_time: string;
  temp_c: number;
  weather_description: string;
  weather_icon: string;
};

export function Weather() {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadWeather() {
      try {
        // Get the current time in UTC to fetch upcoming forecasts
        const now = new Date().toISOString();

        const { data, error } = await supabase
          .from('weather_forecast')
          .select('forecast_time, temp_c, weather_description, weather_icon')
          .gte('forecast_time', now) // Get forecasts from now onwards
          .order('forecast_time', { ascending: true })
          .limit(5); // Get the next 5 forecasts (15 hours)

        if (error) throw error;
        setForecasts(data || []);
      } catch (e: any) {
        setError(e.message);
      }
    }
    loadWeather();
  }, []);

  if (error) {
    return <div className="text-lighthouse">Could not load weather: {error}</div>;
  }

  if (forecasts.length === 0) {
    return <div className="text-gray-500">Loading weather...</div>;
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow-sm border border-sea/20">
      <h3 className="font-bold text-charcoal mb-3">Weather Forecast</h3>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {forecasts.map((f) => (
          <div key={f.forecast_time} className="flex-shrink-0 text-center p-2 rounded-md bg-gray-50 w-24">
            <div className="font-semibold text-sm">
              {new Date(f.forecast_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
            </div>
            <img
              src={`https://openweathermap.org/img/wn/${f.weather_icon}.png`}
              alt={f.weather_description}
              className="w-12 h-12 mx-auto"
            />
            <div className="font-bold">{Math.round(f.temp_c)}°C</div>
          </div>
        ))}
      </div>
    </div>
  );
}