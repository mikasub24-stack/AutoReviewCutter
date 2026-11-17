"""Native A-Bogus adapter for the scan client's existing injection contract."""
from .vendor.native.abogus import ABogus, browser_info_from_screen

class NativeSigner:
    def __init__(self, user_agent):
        self.user_agent = user_agent
        self.native = ABogus(user_agent, browser_info=browser_info_from_screen(1920, 1080, 'Win32'))

    def generate_abogus(self, query, body=''):
        value = self.native.get_value(query, body=body)
        return query, value, self.user_agent, body
