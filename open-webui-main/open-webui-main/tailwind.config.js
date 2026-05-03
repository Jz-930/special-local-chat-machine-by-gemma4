import typography from '@tailwindcss/typography';
import containerQueries from '@tailwindcss/container-queries';

/** @type {import('tailwindcss').Config} */
export default {
	darkMode: 'class',
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				gray: {
					50: '#F8F8F8',
					100: '#E6EEF6',
					200: '#DCDEE1',
					300: '#CBD5DE',
					400: '#9AA4AD',
					500: '#7F858B',
					600: '#33373E',
					700: '#212427',
					800: '#17191C',
					850: '#121318',
					900: '#0A0A0C',
					950: '#0B0F14'
				},
				primary: {
					50: '#F0EBFF',
					100: '#E1D6FF',
					200: '#C3ADFF',
					300: '#A585FF',
					400: '#875CFF',
					500: '#6F4CFF',
					600: '#5A3BFF',
					700: '#4521E6',
					800: '#3415B3',
					900: '#230A80',
					950: '#110340',
				}
			},
			borderRadius: {
				'sm': '0.25rem',
				DEFAULT: '0.5rem',
				'md': '0.75rem',
				'lg': '1rem',
				'xl': '1.25rem',
				'2xl': '1.75rem',
				'3xl': '2.5rem',
			},
			typography: {
				DEFAULT: {
					css: {
						pre: false,
						code: false,
						'pre code': false,
						'code::before': false,
						'code::after': false
					}
				}
			},
			padding: {
				'safe-bottom': 'env(safe-area-inset-bottom)'
			},
			transitionProperty: {
				width: 'width'
			}
		}
	},
	plugins: [typography, containerQueries]
};
