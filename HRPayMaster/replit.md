# HR Pro - Employee Management System

## Overview

This is a comprehensive full-stack HR management application with advanced document tracking and smart expiry alert system. Built with a modern React frontend and Express.js backend, the system manages employees, departments, payroll, vacation requests, loans, fleet management, and comprehensive document expiry tracking with automated email notifications.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **UI Library**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming
- **State Management**: TanStack Query for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon Database (serverless PostgreSQL)
- **Storage**: PostgreSQL database with Drizzle ORM (replaced in-memory storage)

### Project Structure
```
├── client/          # React frontend
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Route components
│   │   ├── hooks/       # Custom React hooks
│   │   └── lib/         # Utilities and configurations
├── server/          # Express backend
│   ├── routes.ts    # API route definitions
│   ├── storage.ts   # Data access layer
│   └── vite.ts      # Development server setup
├── shared/          # Shared types and schemas
└── migrations/      # Database migrations
```

## Key Components

### Data Models
- **Departments**: Basic organizational units with name and description
- **Employees**: Comprehensive employee records with personal info, position, salary, department association, and document tracking (visa, civil ID, passport with customizable expiry alerts)
- **Payroll Runs**: Monthly payroll processing with period tracking and totals
- **Payroll Entries**: Individual employee payroll records with deductions and net pay calculations
- **Vacation Requests**: Employee time-off requests with approval workflow
- **Loans**: Employee loan management with monthly deductions and automatic payroll integration
- **Cars & Assignments**: Fleet management with vehicle tracking and employee assignments
- **Notifications**: Smart document expiry alerts with customizable timing and email integration
- **Email Alerts**: Automated email notification system with SendGrid integration

### API Structure
- RESTful API design with consistent patterns
- CRUD operations for all main entities
- Zod schema validation for request/response data
- Error handling with appropriate HTTP status codes

### Frontend Features
- **Dashboard**: Overview with statistics and recent activity
- **Employee Management**: Full CRUD operations with comprehensive document tracking
- **Department Management**: Organization structure management
- **Payroll System**: Payroll run generation with automatic loan deductions and location-based export
- **Employee Events**: Bonus, deduction, and vacation event tracking with document uploads
- **Reports System**: Comprehensive employee history and analytics with PDF export
- **Vacation Management**: Time-off request system with approval workflow
- **Loan Management**: Employee loan tracking with monthly deduction automation
- **Fleet Management**: Company vehicle assignment and tracking
- **Document Tracking**: Smart expiry monitoring for visas, civil IDs, and passports
- **Notification System**: Real-time alerts with email integration
- **Responsive Design**: Mobile-first approach with adaptive layouts

## Data Flow

1. **Client Requests**: Frontend makes HTTP requests to Express API endpoints
2. **Validation**: Zod schemas validate incoming data on both client and server
3. **Storage Layer**: Abstracted storage interface allows switching between in-memory and database storage
4. **Response**: Typed responses ensure consistency between frontend and backend
5. **State Management**: TanStack Query handles caching, synchronization, and optimistic updates

## External Dependencies

### Frontend Dependencies
- **@tanstack/react-query**: Server state management and caching
- **@radix-ui/***: Headless UI components for accessibility
- **react-hook-form**: Form state management and validation
- **@hookform/resolvers**: Zod integration for form validation
- **wouter**: Lightweight routing solution
- **date-fns**: Date manipulation utilities

### Backend Dependencies
- **drizzle-orm**: Type-safe SQL query builder
- **@neondatabase/serverless**: Serverless PostgreSQL client
- **drizzle-zod**: Zod schema generation from Drizzle schemas
- **express**: Web framework for Node.js

### Development Dependencies
- **vite**: Fast build tool and development server
- **typescript**: Type safety and developer experience
- **tailwindcss**: Utility-first CSS framework
- **esbuild**: Fast JavaScript bundler for production builds

## Deployment Strategy

### Development
- Vite development server with HMR for frontend
- Express server with TypeScript compilation via tsx
- In-memory storage for rapid prototyping
- Hot reload for both frontend and backend changes

### Production Build
- Frontend: Vite builds optimized static assets to `dist/public`
- Backend: esbuild bundles server code to `dist/index.js`
- Single deployment artifact serving both frontend and API
- Environment-based configuration for database connections

### Database Strategy
- Drizzle migrations for schema versioning
- PostgreSQL as the production database
- Neon Database for serverless PostgreSQL hosting
- Schema-first approach with TypeScript type generation

The application is designed to be easily deployable to platforms like Replit, Vercel, or traditional hosting providers, with the flexibility to scale from development to production environments.

## Recent Changes

### January 29, 2025 - Perfect A4 Individual Employee Reports
- ✅ Created perfectly formatted A4 (210x297mm) individual employee reports
- ✅ Optimized all content to fit A4 dimensions with proper margins (15mm)
- ✅ Added smart text wrapping and word breaking to prevent content cutoff
- ✅ Implemented page-break controls to avoid splitting data across pages
- ✅ Created compact yet readable layout with mm-based measurements
- ✅ Built professional header/footer system with company branding
- ✅ Enhanced typography with appropriate font sizes for print readability
- ✅ Added proper print media queries for batch printing optimization
- ✅ Maintained beautiful gradient design while ensuring print compatibility
- ✅ Created complete employee profiles with photo, documents, and event history

### January 29, 2025 - Smart Payroll System Enhancement
- ✅ Enhanced payroll generation with intelligent notification integration
- ✅ Added vacation day calculation and pro-rated salary adjustments
- ✅ Integrated automatic loan deduction processing with payroll
- ✅ Created smart notification system for payroll events (vacation deductions, loan payments)
- ✅ Updated payroll entries schema with working days, vacation tracking, and adjustment reasons
- ✅ Built comprehensive PayrollSummary component with insights and breakdowns
- ✅ Fixed all dialog scrolling issues across forms (employees, loans, vacations, departments)
- ✅ Applied max-height and overflow-y-auto to all modal dialogs for better UX

### January 28, 2025 - Database Integration
- ✅ Added PostgreSQL database using Neon
- ✅ Replaced MemStorage with DatabaseStorage implementation
- ✅ Added complete Drizzle ORM relations for all entities
- ✅ Successfully pushed database schema with all tables
- ✅ Fixed all TypeScript compatibility issues
- ✅ Application now uses persistent PostgreSQL storage