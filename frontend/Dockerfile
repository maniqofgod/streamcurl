# Tahap 1: Build aplikasi React menggunakan base image yang lebih kecil
FROM node:16-alpine AS build
WORKDIR /usr/src/app

# Salin package.json dan package-lock.json
COPY package*.json ./

# Instal dependensi secara bersih dan cepat
RUN npm install

# Salin sisa kode aplikasi
COPY . ./

# Build aplikasi
RUN npm run build

# Tahap 2: Sajikan dengan Nginx
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /usr/src/app/build /usr/share/nginx/html
