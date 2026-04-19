interface BookingUrlParams {
  hotelName: string;
  city: string;
  checkIn: string;
  checkOut: string;
  adults?: number;
}

export function buildBookingUrl(params: BookingUrlParams): { url: string } {
  const ss = `${params.hotelName}, ${params.city}`;
  const url = new URL("https://www.booking.com/searchresults.html");
  url.searchParams.set("ss", ss);
  url.searchParams.set("checkin", params.checkIn);
  url.searchParams.set("checkout", params.checkOut);
  url.searchParams.set("group_adults", String(params.adults || 2));
  url.searchParams.set("no_rooms", "1");
  return { url: url.toString() };
}
