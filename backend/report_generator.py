import os
from fpdf import FPDF
from datetime import datetime

class PDFReport(FPDF):
    def header(self):
        self.set_font('Arial', 'B', 15)
        self.cell(0, 10, 'Carbon Intelligence Monthly Report', 0, 1, 'C')
        self.ln(10)

    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()}', 0, 0, 'C')

def generate_pdf_report(user, entries, eco_score):
    pdf = PDFReport()
    pdf.add_page()
    
    # User Info
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 10, f'User: {user["username"]} ({user["email"]})', 0, 1)
    pdf.cell(0, 10, f'Eco-Score: {eco_score}', 0, 1)
    pdf.ln(10)
    
    # Summary Table Header
    pdf.set_font('Arial', 'B', 10)
    pdf.cell(40, 10, 'Date', 1)
    pdf.cell(30, 10, 'Transport', 1)
    pdf.cell(30, 10, 'Electricity', 1)
    pdf.cell(30, 10, 'Waste', 1)
    pdf.cell(30, 10, 'Total CO2', 1)
    pdf.ln()
    
    # Data Rows
    pdf.set_font('Arial', '', 10)
    total_co2 = 0
    for e in entries:
        dt = e.get('timestamp')
        date_str = dt.strftime('%Y-%m-%d') if dt else 'N/A'
        pdf.cell(40, 10, date_str, 1)
        pdf.cell(30, 10, f"{e.get('transport_km', 0)} km", 1)
        pdf.cell(30, 10, f"{e.get('electricity_kwh', 0)} kWh", 1)
        pdf.cell(30, 10, f"{e.get('waste_kg', 0)} kg", 1)
        co2 = e.get('total_carbon_kg', 0)
        total_co2 += co2
        pdf.cell(30, 10, f"{co2:.2f} kg", 1)
        pdf.ln()
        
    pdf.ln(10)
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 10, f'Total Monthly Emissions: {total_co2:.2f} kg CO2', 0, 1)
    
    os.makedirs('/tmp/reports', exist_ok=True)
    filepath = f'/tmp/reports/report_{user["username"]}_{datetime.utcnow().timestamp()}.pdf'
    pdf.output(filepath)
    return filepath
